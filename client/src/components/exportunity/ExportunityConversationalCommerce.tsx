import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  BriefcaseBusiness,
  Camera,
  ChevronDown,
  Compass,
  Coffee,
  Cpu,
  Factory,
  Gift,
  Hammer,
  Leaf,
  Map as MapIcon,
  MapPin,
  Mic,
  Moon,
  Navigation,
  Package,
  Paperclip,
  Pill,
  Search,
  Send,
  Shirt,
  Square,
  Store,
  Sun,
  Truck,
  Utensils,
  Video,
  Warehouse,
  type LucideIcon,
  Plus,
  Minus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { findConversationFlow } from "./conversationFlows";
import { getSeededBusinessPlaces, type SeededBusinessPlace } from "./seededBusinessData";

export type ConversationSpace = "city" | "shop" | "business" | "wholesale" | "exchange";
export type ThemeMode = "light" | "dark";

export type CommerceAgent = {
  id: string;
  name: string;
  role: string;
  status: "online" | "available" | "quiet";
  avatarUrl?: string;
  color: string;
};

export type CommerceShop = {
  id: string;
  name: string;
  category: string;
  image: string;
  distance: string;
  eta: string;
  position: [number, number];
  frontDesk: CommerceAgent;
  openLabel: string;
  rating: number;
  ratingCount: number;
  moq?: string;
  leadTime?: string;
  trustStatus?: string;
  availableQuantity?: string;
  contactStatus?: string;
  city?: string;
  district?: string;
  source?: "google" | "seeded" | "onboarded" | "manual";
  investmentReadiness?: string;
  merchantStory?: string;
};

export type ConversationMessage = {
  id: string;
  agentId: string;
  content: string;
  createdAt: string;
  imageUrl?: string;
  shopId?: string;
  agentSnapshot?: CommerceAgent;
};

export type ShopProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  priceCfa: number;
  quantityAvailable: number;
  image: string;
};

type ShopOrderLine = {
  product: ShopProduct;
  quantity: number;
};

export type ExportunityShellMode = "commerce" | "mapDominant" | "mapFull";
export type ExportunityExchangeVariant = "export" | "pme";

type ExportunityConversationalCommerceProps = {
  onNavigate?: (href: string) => void;
  isAdmin?: boolean;
  initialSpace?: ConversationSpace;
  embeddedShell?: boolean;
  shellMode?: ExportunityShellMode;
};

type PlacesProvider = "google" | "curated";

type PublicPlacesState = {
  provider: PlacesProvider;
  label: string;
  detail: string;
  lastSyncTime?: string;
};

type PublicMapsConfig = {
  provider: "google" | "leaflet";
  enabled: boolean;
  apiKey: string | null;
  mapIdLight?: string | null;
  mapIdDark?: string | null;
  message?: string;
};

declare global {
  interface Window {
    google?: any;
    __exportunityGoogleMapsPromise?: Promise<void>;
    gm_authFailure?: () => void;
  }
}

const ABIDJAN_COCODY: [number, number] = [5.35995, -4.00826];

function kmBetween(from: [number, number], to: [number, number]) {
  const radius = 6371;
  const dLat = ((to[0] - from[0]) * Math.PI) / 180;
  const dLon = ((to[1] - from[1]) * Math.PI) / 180;
  const lat1 = (from[0] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceEta(position: [number, number]) {
  const km = kmBetween(ABIDJAN_COCODY, position);
  return {
    distance: `${Math.max(0.4, km).toFixed(1)} km`,
    eta: `${Math.max(3, Math.round(km * 4.2))} min`,
  };
}

function isFinitePosition(position: unknown): position is [number, number] {
  return (
    Array.isArray(position) &&
    position.length === 2 &&
    Number.isFinite(Number(position[0])) &&
    Number.isFinite(Number(position[1]))
  );
}

const agents: Record<string, CommerceAgent> = {
  tassi: {
    id: "tassi",
    name: "Tassi",
    role: "Concierge",
    status: "online",
    color: "#F5A623",
    avatarUrl: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=180&q=85",
  },
  awa: {
    id: "awa",
    name: "Awa",
    role: "Front Desk",
    status: "available",
    color: "#f97316",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=180&q=85",
  },
  koffi: {
    id: "koffi",
    name: "Koffi",
    role: "Delivery",
    status: "quiet",
    color: "#16a34a",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=180&q=85",
  },
  wallet: {
    id: "wallet",
    name: "Wallet",
    role: "Accountant",
    status: "quiet",
    color: "#2563eb",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=180&q=85",
  },
  guide: {
    id: "guide",
    name: "Local Guide",
    role: "Nearby discovery",
    status: "available",
    color: "#7c3aed",
  },
  supplier: {
    id: "supplier-agent",
    name: "Kone",
    role: "Supplier Desk",
    status: "available",
    color: "#0f766e",
    avatarUrl: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&w=180&q=85",
  },
};

function agentForPlace(place: SeededBusinessPlace, index: number) {
  if (place.type === "wholesale") {
    const names = ["Kone", "Amina", "Dao", "Moussa", "Soro", "Nadia"];
    return { ...agents.supplier, id: `supplier-${place.id}`, name: names[index % names.length] };
  }
  const names = ["Awa", "Marie", "Iya", "Mariam", "Noah", "Amadou"];
  return { ...agents.awa, id: `frontdesk-${place.id}`, name: names[index % names.length], color: getShopTone(place.category).color };
}

function seededPlaceToShop(place: SeededBusinessPlace, index: number): CommerceShop {
  const position: [number, number] = [place.lat, place.lng];
  const meta = formatDistanceEta(position);
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    image: place.imageUrl,
    distance: meta.distance,
    eta: meta.eta,
    position,
    frontDesk: agentForPlace(place, index),
    openLabel: place.openStatus,
    rating: place.rating,
    ratingCount: place.reviewCount,
    moq: place.moq,
    leadTime: place.leadTime,
    trustStatus: place.verificationStatus,
    availableQuantity: place.availableQuantity,
    contactStatus: place.contactStatus,
    city: place.city,
    district: place.district,
    source: place.source,
  };
}

const shops: CommerceShop[] = getSeededBusinessPlaces({ city: "Abidjan", type: "marketplace" }).map(seededPlaceToShop);
const wholesaleSuppliers: CommerceShop[] = getSeededBusinessPlaces({ city: "Abidjan", type: "wholesale" }).map(seededPlaceToShop);
const exchangePlaces: CommerceShop[] = [
  ...shops.slice(0, 14).map((shop, index) => ({
    ...shop,
    trustStatus: index % 4 === 0 ? "Verification review" : shop.trustStatus || "Neighbourhood signal",
    investmentReadiness: index % 5 === 0 ? "Review-ready" : index % 3 === 0 ? "Revenue signals" : "Trust building",
    merchantStory: `${shop.name} is a neighbourhood ${shop.category.toLowerCase()} business with visible customer activity around ${shop.district || "Cocody"}.`,
  })),
  ...wholesaleSuppliers.slice(0, 8).map((shop, index) => ({
    ...shop,
    trustStatus: index % 3 === 0 ? "Supplier verification" : shop.trustStatus || "Public listing",
    investmentReadiness: index % 4 === 0 ? "Internal review" : "Commercial opportunity",
    merchantStory: `${shop.name} supplies local buyers and can be reviewed for structured commercial opportunities after verification.`,
  })),
];

const SHOP_PRODUCT_LIBRARY: Record<string, ShopProduct[]> = {
  Bakery: [
    {
      id: "prod-bread-1",
      name: "Pain complet",
      description: "Pain de campagne croustillant, cuit dans la journée.",
      category: "Fresh Bread",
      unit: "piece",
      priceCfa: 900,
      quantityAvailable: 80,
      image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "prod-bread-2",
      name: "Croissant",
      description: "Pâte feuilletée au beurre, prête à livrer.",
      category: "Breakfast",
      unit: "piece",
      priceCfa: 500,
      quantityAvailable: 120,
      image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
    },
  ],
  "Coffee": [
    {
      id: "prod-coffee-1",
      name: "Coffee Beans Etiam",
      description: "Mélange maison, moulu pour préparation filtre.",
      category: "Coffee",
      unit: "500g",
      priceCfa: 3500,
      quantityAvailable: 60,
      image: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "prod-coffee-2",
      name: "Cold Brew (pack)",
      description: "Préparation café prête à boire, 6 bouteilles.",
      category: "Beverage",
      unit: "pack",
      priceCfa: 4200,
      quantityAvailable: 24,
      image: "https://images.unsplash.com/photo-1485808191679-5f86510689c9?auto=format&fit=crop&w=900&q=80",
    },
  ],
  "Hardware Store": [
    {
      id: "prod-hardware-1",
      name: "Ciment Portland",
      description: "Ciment 42.5, lot stable pour travaux.",
      category: "Construction",
      unit: "25kg",
      priceCfa: 7500,
      quantityAvailable: 320,
      image: "https://images.unsplash.com/photo-1518005020951-eccb494ad4ac?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "prod-hardware-2",
      name: "Gravier sec",
      description: "Gravier calibré, livrable en lots.",
      category: "Construction",
      unit: "m3",
      priceCfa: 23000,
      quantityAvailable: 60,
      image: "https://images.unsplash.com/photo-1576402187878-974f0e2f0d2f?auto=format&fit=crop&w=900&q=80",
    },
  ],
  "Building Materials": [
    {
      id: "prod-w-build-1",
      name: "Sable 0/4",
      description: "Sable pour maçonnerie et fondation légère.",
      category: "Materials",
      unit: "m3",
      priceCfa: 13000,
      quantityAvailable: 90,
      image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "prod-w-build-2",
      name: "Tôle ondulée",
      description: "Toiture standard, lot commercial.",
      category: "Roofing",
      unit: "sheet",
      priceCfa: 4500,
      quantityAvailable: 120,
      image: "https://images.unsplash.com/photo-1578574577315-1fffe8f6c6f5?auto=format&fit=crop&w=900&q=80",
    },
  ],
};

function googlePlaceToShop(item: any, index: number, type: "marketplace" | "wholesale"): CommerceShop | null {
  if (typeof item?.lat !== "number" || typeof item?.lng !== "number") return null;
  const position: [number, number] = [item.lat, item.lng];
  const meta = formatDistanceEta(position);
  const fallback = type === "wholesale" ? wholesaleSuppliers[index % wholesaleSuppliers.length] : shops[index % shops.length];
  return {
    id: `google-${item.google_place_id || index}`,
    name: item.name || fallback.name,
    category: item.category || fallback.category,
    image: fallback.image,
    distance: meta.distance,
    eta: meta.eta,
    position,
    frontDesk: type === "wholesale" ? { ...agents.supplier, id: `google-supplier-${index}` } : { ...agents.awa, id: `google-frontdesk-${index}` },
    openLabel: "Public listing",
    rating: Number(item.rating || fallback.rating || 4.4),
    ratingCount: Number(item.review_count || fallback.ratingCount || 24),
    trustStatus: "Public listing",
    contactStatus: "contact_required",
    source: "google",
  };
}

const businessAgents: CommerceAgent[] = [
  { id: "front-desk", name: "Front Desk", role: "Customer flow", status: "online", color: "#f97316", avatarUrl: agents.awa.avatarUrl },
  { id: "inventory", name: "Inventory", role: "Stock Manager", status: "online", color: "#2563eb" },
  { id: "accountant", name: "Accountant", role: "Finance", status: "online", color: "#16a34a", avatarUrl: agents.wallet.avatarUrl },
  { id: "delivery-lead", name: "Delivery Lead", role: "Logistics", status: "online", color: "#7c3aed", avatarUrl: agents.koffi.avatarUrl },
  { id: "marketing", name: "Marketing", role: "Growth", status: "online", color: "#d97706" },
  { id: "owner", name: "Owner", role: "You", status: "online", color: "#111827" },
];

const districtLabels = [
  { label: "RIVIERA 3", className: "left-[7%] top-[24%]" },
  { label: "COCODY", className: "left-[42%] top-[34%]" },
  { label: "BINGERVILLE", className: "right-[14%] top-[22%]" },
  { label: "VRIDI", className: "left-[28%] bottom-[20%]" },
  { label: "KOUMASSI", className: "right-[26%] bottom-[24%]" },
];

const cityQuickReplies = ["Find breakfast near me", "Fresh bread", "Coffee nearby", "Organic products", "Building materials", "Need delivery", "Send to family", "Find a pharmacy"];
const wholesaleQuickReplies = ["Find suppliers near me", "Request a quote", "Building materials wholesale", "Machinery", "Food ingredients", "Packaging", "Logistics help", "Sell wholesale"];
const exchangeQuickReplies = ["Ready for export", "Verified sellers", "Fashion sellers", "Food exporters", "Women-led shops", "Seller proof"];
const shopQuickReplies = ["What should I buy first?", "Can you deliver?", "Can I see it live?", "Use my wallet", "Order a sample"];
const businessQuickReplies = ["Summarize today", "What is low in stock?", "Show today's orders", "Plan a promo", "Assign delivery"];

const initialMessages: ConversationMessage[] = [
  {
    id: "hello",
    agentId: "tassi",
    content: "Hello, I'm Tassi. Search for products, shops, delivery, or suppliers around you today.",
    createdAt: "now",
  },
  {
    id: "location",
    agentId: "tassi",
    content: "I can guide you through nearby shops, trusted sellers, suppliers, delivery, and payment options around Cocody.",
    createdAt: "now",
  },
];

function getShopTone(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes("coffee")) return { color: "#7c3f1d" };
  if (normalized.includes("building")) return { color: "#2563eb" };
  if (normalized.includes("gift")) return { color: "#9333ea" };
  if (normalized.includes("pharmacy")) return { color: "#16a34a" };
  if (normalized.includes("organic") || normalized.includes("natural") || normalized.includes("food")) return { color: "#65a30d" };
  if (normalized.includes("machinery")) return { color: "#475569" };
  if (normalized.includes("packaging")) return { color: "#0f766e" };
  return { color: "#F5A623" };
}

function normalizeCategoryKey(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes("bakery") || normalized.includes("bread")) return "Bakery";
  if (normalized.includes("cafe") || normalized.includes("coffee")) return "Coffee";
  if (normalized.includes("building") || normalized.includes("hardware")) return "Building Materials";
  return category;
}

function getProductsForShop(shop: CommerceShop): ShopProduct[] {
  const key = normalizeCategoryKey(shop.category);
  const seeded = SHOP_PRODUCT_LIBRARY[key];
  if (seeded?.length) return seeded;
  return [
    {
      id: `fallback-${shop.id}-1`,
      name: `${shop.name} featured item`,
      description: "Available in small quantity. Ask for current stock by message.",
      category: "Featured",
      unit: "unit",
      priceCfa: 2500,
      quantityAvailable: 20,
      image: shop.image,
    },
    {
      id: `fallback-${shop.id}-2`,
      name: `${shop.name} best seller`,
      description: "Popular option for quick delivery in nearby areas.",
      category: "Popular",
      unit: "unit",
      priceCfa: 3200,
      quantityAvailable: 10,
      image: shop.image,
    },
  ];
}

function getCategoryIcon(category: string, wholesale: boolean, exchange = false) {
  return getCleanCategoryVisual(category, wholesale, exchange).marker;
}

function getCommerceCategoryVisual(category: string, wholesale: boolean, exchange = false): { marker: string; Icon: LucideIcon; label: string } {
  const normalized = category.toLowerCase();
  if (exchange) return { marker: "Export", Icon: BriefcaseBusiness, label: "Export" };
  if (normalized.includes("bakery") || normalized.includes("bread")) return { marker: "BR", Icon: Store, label: "Bakery" };
  if (normalized.includes("coffee") || normalized.includes("cafe")) return { marker: "CF", Icon: Coffee, label: "Coffee" };
  if (normalized.includes("restaurant")) return { marker: "FD", Icon: Utensils, label: "Food" };
  if (normalized.includes("grocery") || normalized.includes("organic") || normalized.includes("food")) return { marker: "GR", Icon: Leaf, label: "Groceries" };
  if (normalized.includes("pharmacy") || normalized.includes("sante")) return { marker: "RX", Icon: Pill, label: "Pharmacy" };
  if (normalized.includes("fashion") || normalized.includes("textile")) return { marker: "ST", Icon: Shirt, label: "Fashion" };
  if (normalized.includes("gift")) return { marker: "GF", Icon: Gift, label: "Gifts" };
  if (normalized.includes("hardware") || normalized.includes("building") || normalized.includes("construction")) return { marker: "MT", Icon: Hammer, label: "Materials" };
  if (normalized.includes("electronics") || normalized.includes("technologie")) return { marker: "EL", Icon: Cpu, label: "Electronics" };
  if (normalized.includes("machinery") || normalized.includes("industrial")) return { marker: "IN", Icon: Factory, label: "Industry" };
  if (normalized.includes("logistics") || normalized.includes("warehouse")) return { marker: "LG", Icon: Truck, label: "Logistics" };
  if (normalized.includes("packaging")) return { marker: "PK", Icon: Package, label: "Packaging" };
  return wholesale ? { marker: "WH", Icon: Warehouse, label: "Supplier" } : { marker: "SH", Icon: Store, label: "Shop" };
}

function getCleanCategoryVisual(category: string, wholesale: boolean, exchange = false): { marker: string; Icon: LucideIcon; label: string } {
  const normalized = category.toLowerCase();
  if (exchange) return { marker: "🏢", Icon: BriefcaseBusiness, label: "Export" };
  if (normalized.includes("bakery") || normalized.includes("bread")) return { marker: "🥖", Icon: Store, label: "Bakery" };
  if (normalized.includes("coffee") || normalized.includes("cafe")) return { marker: "☕", Icon: Coffee, label: "Coffee" };
  if (normalized.includes("restaurant")) return { marker: "🍽", Icon: Utensils, label: "Food" };
  if (normalized.includes("grocery") || normalized.includes("organic") || normalized.includes("food")) return { marker: "🌿", Icon: Leaf, label: "Groceries" };
  if (normalized.includes("pharmacy") || normalized.includes("sante")) return { marker: "✚", Icon: Pill, label: "Pharmacy" };
  if (normalized.includes("fashion") || normalized.includes("textile")) return { marker: "◐", Icon: Shirt, label: "Fashion" };
  if (normalized.includes("gift")) return { marker: "✦", Icon: Gift, label: "Gifts" };
  if (normalized.includes("hardware") || normalized.includes("building") || normalized.includes("construction")) return { marker: "🔨", Icon: Hammer, label: "Materials" };
  if (normalized.includes("electronics") || normalized.includes("technologie")) return { marker: "⚡", Icon: Cpu, label: "Electronics" };
  if (normalized.includes("machinery") || normalized.includes("industrial")) return { marker: "🏭", Icon: Factory, label: "Industry" };
  if (normalized.includes("logistics") || normalized.includes("warehouse")) return { marker: "🚚", Icon: Truck, label: "Logistics" };
  if (normalized.includes("packaging")) return { marker: "📦", Icon: Package, label: "Packaging" };
  return wholesale ? { marker: "◆", Icon: Warehouse, label: "Supplier" } : { marker: "⌂", Icon: Store, label: "Shop" };
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function makeShopIcon(shop: CommerceShop, active: boolean, dark: boolean, wholesale: boolean, exchange = false) {
  const tone = getShopTone(shop.category);
  const border = active ? "#F5A623" : dark ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.98)";
  const bg = dark ? "rgba(5,7,11,.82)" : "rgba(255,255,255,.92)";
  const fg = dark ? "#fff" : "#111827";
  const muted = dark ? "rgba(255,255,255,.72)" : "#4b5563";
  const icon = getCategoryIcon(shop.category, wholesale, exchange);
  const glow = active
    ? "0 0 0 6px rgba(245,166,35,.24),0 0 42px rgba(245,166,35,.74),0 22px 54px rgba(0,0,0,.28)"
    : dark
      ? "0 20px 50px rgba(0,0,0,.38)"
      : "0 18px 42px rgba(15,23,42,.16)";
  const meta = wholesale && shop.moq ? `${shop.moq} | ${shop.leadTime || shop.eta}` : `${shop.distance} | ${shop.eta}`;

  const status = exchange ? shop.investmentReadiness || "Internal review" : shop.openLabel;
  const trust = exchange ? shop.trustStatus || "Export-ready profile" : shop.trustStatus || "Nearby";

  return L.divIcon({
    className: "exportunity-shop-marker",
    iconSize: [active ? 260 : 214, wholesale ? 148 : 126],
    iconAnchor: [active ? 130 : 107, wholesale ? 142 : 120],
    popupAnchor: [0, -132],
    html: `
      <button type="button" aria-label="${escapeHtml(shop.name)}" style="width:${active ? "260px" : "214px"};text-align:left;border:0;background:transparent;padding:0;font-family:Inter,system-ui,sans-serif;">
        <div style="border:1px solid ${border};border-radius:18px;background:${bg};color:${fg};box-shadow:${glow};backdrop-filter:blur(18px);overflow:hidden;">
          <div style="display:flex;gap:9px;align-items:center;padding:9px;">
            <div style="position:relative;display:grid;place-items:center;height:64px;width:70px;border-radius:16px;background:linear-gradient(145deg,${tone.color},#F5A623);box-shadow:0 10px 24px rgba(0,0,0,.18);overflow:hidden;">
              <img src="${escapeHtml(shop.image)}" alt="" style="position:absolute;inset:0;height:100%;width:100%;object-fit:cover;opacity:.42;filter:saturate(1.1) contrast(1.05);" />
              <span style="position:relative;display:grid;place-items:center;width:38px;height:38px;border-radius:999px;background:rgba(255,255,255,.92);color:${tone.color};font-size:19px;font-weight:950;box-shadow:0 8px 20px rgba(0,0,0,.18);">${escapeHtml(icon)}</span>
            </div>
            <div style="min-width:0;flex:1;">
              <div style="font-size:${active ? "15px" : "13px"};font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(shop.name)}</div>
              <div style="font-size:12px;color:${muted};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(shop.category)}</div>
              <div style="font-size:12px;color:${muted};margin-top:5px;">Rating ${shop.rating.toFixed(1)} (${shop.ratingCount})</div>
              <div style="font-size:12px;color:${muted};margin-top:4px;">${escapeHtml(meta)}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(148,163,184,.22);padding:7px 10px;font-size:11px;">
            <span style="color:${active ? "#F5A623" : muted};font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(status)}</span>
            <span style="color:${muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-left:8px;">${escapeHtml(trust)}</span>
          </div>
        </div>
        <span style="display:grid;place-items:center;width:34px;height:34px;margin:-5px auto 0;border-radius:999px;border:2px solid rgba(255,255,255,.9);background:${active ? "#F5A623" : tone.color};color:${active ? "#07111F" : "#fff"};box-shadow:0 0 0 7px ${active ? "rgba(245,166,35,.2)" : "rgba(255,255,255,.16)"},0 0 24px ${tone.color};">
          <span style="font-size:15px;font-weight:950;line-height:1;">${escapeHtml(icon)}</span>
        </span>
      </button>
    `,
  });
}

function makeUserIcon() {
  return L.divIcon({
    className: "exportunity-user-marker",
    iconSize: [140, 80],
    iconAnchor: [70, 64],
    html: `
      <div style="display:grid;justify-items:center;font-family:Inter,system-ui,sans-serif;">
        <div style="border-radius:999px;background:#111827;color:white;padding:8px 14px;font-weight:850;font-size:13px;box-shadow:0 12px 28px rgba(15,23,42,.32);">You are here</div>
        <div style="margin-top:8px;width:28px;height:28px;border-radius:999px;border:4px solid white;background:#2563eb;box-shadow:0 0 0 16px rgba(37,99,235,.18),0 0 36px rgba(37,99,235,.78);"></div>
      </div>
    `,
  });
}

function makeCompactShopIcon(shop: CommerceShop, active: boolean, dark: boolean, wholesale: boolean, exchange = false) {
  const tone = getShopTone(shop.category);
  const icon = getCategoryIcon(shop.category, wholesale, exchange);
  return L.divIcon({
    className: "exportunity-compact-marker",
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18],
    html: `
      <button type="button" aria-label="${escapeHtml(shop.name)}" style="display:grid;place-items:center;width:42px;height:42px;border-radius:999px;border:2px solid ${active ? "#F5A623" : "rgba(255,255,255,.94)"};background:${tone.color};color:white;box-shadow:0 0 0 ${active ? "8px" : "4px"} rgba(245,166,35,.18),0 12px 26px rgba(0,0,0,.24);font-family:Inter,system-ui,sans-serif;font-size:${exchange ? "12px" : "16px"};font-weight:950;">
        ${escapeHtml(icon)}
      </button>
    `,
  });
}

function MapFocus({
  userLocation,
  activeShop,
  resultsVisible,
  places,
}: {
  userLocation: [number, number];
  activeShop: CommerceShop | null;
  resultsVisible: boolean;
  places: CommerceShop[];
}) {
  const map = useMap();

  useEffect(() => {
    const safeUserLocation: [number, number] = isFinitePosition(userLocation)
      ? [Number(userLocation[0]), Number(userLocation[1])]
      : ABIDJAN_COCODY;
    const safePlaces = places.filter((shop) => isFinitePosition(shop.position));

    try {
      const size = map.getSize();
      if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || size.x <= 0 || size.y <= 0) return;
      if (activeShop && isFinitePosition(activeShop.position)) {
        map.flyTo([Number(activeShop.position[0]), Number(activeShop.position[1])], 15, { duration: 1.15, easeLinearity: 0.18 });
        return;
      }
      if (resultsVisible) {
        const bounds = L.latLngBounds([safeUserLocation, ...safePlaces.map((shop) => [Number(shop.position[0]), Number(shop.position[1])] as [number, number])]);
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [44, 44], maxZoom: 13, duration: 1.05, easeLinearity: 0.18 });
          return;
        }
      }
      map.flyTo(safeUserLocation, 14, { duration: 0.95, easeLinearity: 0.18 });
    } catch {
      map.setView(safeUserLocation, 14, { animate: false });
    }
  }, [activeShop, map, places, resultsVisible, userLocation]);

  return null;
}

function loadGoogleMapsScript(apiKey: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("No browser window"));
  if (window.google?.maps?.Map) return Promise.resolve();
  if (window.__exportunityGoogleMapsPromise) return window.__exportunityGoogleMapsPromise;

  window.__exportunityGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-exportunity-google-maps="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.dataset.exportunityGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=marker&v=weekly&loading=async`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });

  return window.__exportunityGoogleMapsPromise;
}

function makeGoogleMarkerElement(shop: CommerceShop, active: boolean, dark: boolean, wholesale: boolean, exchange: boolean) {
  const tone = getShopTone(shop.category);
  const visual = getCleanCategoryVisual(shop.category, wholesale, exchange);
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.className = "exportunity-google-marker";
  wrapper.setAttribute("aria-label", shop.name);
  wrapper.innerHTML = `
    <span class="exportunity-google-marker__pin" style="--tone:${tone.color};--ring:${active ? "#F5A623" : "rgba(255,255,255,.92)"}">${escapeHtml(visual.marker)}</span>
    ${
      active
        ? `<span class="exportunity-google-marker__card ${dark ? "is-dark" : ""}">
            <img src="${escapeHtml(shop.image)}" alt="" />
            <span>
              <strong>${escapeHtml(shop.name)}</strong>
              <em>${escapeHtml(shop.category)}</em>
              <small>${shop.rating.toFixed(1)} (${shop.ratingCount}) · ${escapeHtml(shop.distance)} · ${escapeHtml(shop.eta)}</small>
            </span>
          </span>`
        : ""
    }
  `;
  return wrapper;
}

function GoogleMapsCanvas({
  apiKey,
  mapId,
  userLocation,
  activeShop,
  resultsVisible,
  places,
  visiblePlaces,
  routePoints,
  dark,
  wholesale,
  exchange,
  onSelect,
  onProviderError,
}: {
  apiKey: string;
  mapId?: string;
  userLocation: [number, number];
  activeShop: CommerceShop | null;
  resultsVisible: boolean;
  places: CommerceShop[];
  visiblePlaces: CommerceShop[];
  routePoints: [number, number][];
  dark: boolean;
  wholesale: boolean;
  exchange: boolean;
  onSelect: (shop: CommerceShop) => void;
  onProviderError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const routeRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const providerErrorRef = useRef(onProviderError);

  useEffect(() => {
    providerErrorRef.current = onProviderError;
  }, [onProviderError]);

  useEffect(() => {
    let cancelled = false;
    const authFailureHandler = () => {
      providerErrorRef.current();
    };
    window.gm_authFailure = authFailureHandler;
    void loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.maps) return;
        const center = { lat: userLocation[0], lng: userLocation[1] };
        mapRef.current = new window.google.maps.Map(containerRef.current, {
          center,
          zoom: 13,
          mapId,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: true,
          gestureHandling: "greedy",
          backgroundColor: dark ? "#07111F" : "#F7F8FA",
          styles: mapId
            ? undefined
            : dark
              ? [
                  { elementType: "geometry", stylers: [{ color: "#172033" }] },
                  { elementType: "labels.text.fill", stylers: [{ color: "#d6e0ee" }] },
                  { elementType: "labels.text.stroke", stylers: [{ color: "#07111F" }] },
                  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2b3449" }] },
                  { featureType: "water", elementType: "geometry", stylers: [{ color: "#061423" }] },
                ]
              : [
                  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
                  { featureType: "road", elementType: "geometry", stylers: [{ color: "#f4e4c6" }] },
                  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbeafe" }] },
                ],
        });
      })
      .catch(() => providerErrorRef.current());
    return () => {
      cancelled = true;
      if (window.gm_authFailure === authFailureHandler) {
        window.gm_authFailure = undefined;
      }
    };
  }, [apiKey, dark, mapId, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;

    markerRefs.current.forEach((marker) => {
      if ("map" in marker) marker.map = null;
      else marker.setMap?.(null);
    });
    markerRefs.current = [];
    if (userMarkerRef.current) {
      if ("map" in userMarkerRef.current) userMarkerRef.current.map = null;
      else userMarkerRef.current.setMap?.(null);
    }

    const userElement = document.createElement("div");
    userElement.className = "exportunity-google-user";
    userElement.innerHTML = `<span>You are here</span><i></i>`;
    const userPosition = { lat: userLocation[0], lng: userLocation[1] };
    const canUseAdvancedMarkers = Boolean(mapId && window.google.maps.marker?.AdvancedMarkerElement);

    if (canUseAdvancedMarkers) {
      userMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
        map,
        position: userPosition,
        content: userElement,
        zIndex: 20,
      });
    } else {
      userMarkerRef.current = new window.google.maps.Marker({ map, position: userPosition, title: "You are here" });
    }

    visiblePlaces.forEach((shop) => {
      const active = activeShop?.id === shop.id;
      const position = { lat: shop.position[0], lng: shop.position[1] };
      let marker: any;
      if (canUseAdvancedMarkers) {
        marker = new window.google.maps.marker.AdvancedMarkerElement({
          map,
          position,
          content: makeGoogleMarkerElement(shop, active, dark, wholesale, exchange),
          zIndex: active ? 30 : 10,
        });
      } else {
        marker = new window.google.maps.Marker({ map, position, title: shop.name });
      }
      marker.addListener?.("click", () => onSelect(shop));
      markerRefs.current.push(marker);
    });
  }, [activeShop, dark, exchange, mapId, onSelect, userLocation, visiblePlaces, wholesale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    if (routeRef.current) routeRef.current.setMap(null);
    routeRef.current = new window.google.maps.Polyline({
      path: routePoints.map(([lat, lng]) => ({ lat, lng })),
      map,
      strokeColor: "#F5A623",
      strokeOpacity: 0.86,
      strokeWeight: 4,
      geodesic: true,
    });
  }, [routePoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    if (activeShop) {
      map.panTo({ lat: activeShop.position[0], lng: activeShop.position[1] });
      map.setZoom(15);
      return;
    }
    if (resultsVisible && visiblePlaces.length) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend({ lat: userLocation[0], lng: userLocation[1] });
      visiblePlaces.forEach((shop) => bounds.extend({ lat: shop.position[0], lng: shop.position[1] }));
      map.fitBounds(bounds, 72);
      return;
    }
    map.panTo({ lat: userLocation[0], lng: userLocation[1] });
    map.setZoom(14);
  }, [activeShop, resultsVisible, userLocation, visiblePlaces, places]);

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      <style>{`
        .exportunity-google-marker {
          position: relative;
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          cursor: pointer;
          font-family: Inter, system-ui, sans-serif;
        }
        .exportunity-google-marker__pin {
          display: grid;
          place-items: center;
          width: 46px;
          height: 46px;
          border: 2px solid var(--ring);
          border-radius: 999px;
          background: var(--tone);
          color: white;
          font-size: 18px;
          font-weight: 950;
          box-shadow: 0 0 0 7px rgba(245,166,35,.16), 0 14px 30px rgba(0,0,0,.24);
        }
        .exportunity-google-marker__card {
          position: absolute;
          left: 58px;
          top: -20px;
          display: grid;
          grid-template-columns: 74px 1fr;
          gap: 10px;
          width: 250px;
          padding: 9px;
          border: 1px solid rgba(255,255,255,.92);
          border-radius: 18px;
          background: rgba(255,255,255,.94);
          color: #111827;
          box-shadow: 0 22px 52px rgba(15,23,42,.18);
          backdrop-filter: blur(18px);
          text-align: left;
        }
        .exportunity-google-marker__card.is-dark {
          border-color: rgba(255,255,255,.18);
          background: rgba(7,17,31,.88);
          color: #f8fafc;
        }
        .exportunity-google-marker__card img {
          height: 68px;
          width: 74px;
          object-fit: cover;
          border-radius: 13px;
        }
        .exportunity-google-marker__card strong,
        .exportunity-google-marker__card em,
        .exportunity-google-marker__card small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .exportunity-google-marker__card strong { font-size: 14px; font-weight: 950; }
        .exportunity-google-marker__card em { margin-top: 2px; font-size: 12px; color: #64748b; font-style: normal; }
        .exportunity-google-marker__card small { margin-top: 6px; font-size: 12px; color: #475569; }
        .exportunity-google-marker__card.is-dark em,
        .exportunity-google-marker__card.is-dark small { color: rgba(255,255,255,.68); }
        .exportunity-google-user {
          display: grid;
          justify-items: center;
          font-family: Inter, system-ui, sans-serif;
        }
        .exportunity-google-user span {
          border-radius: 999px;
          background: #111827;
          color: white;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 850;
          box-shadow: 0 12px 28px rgba(15,23,42,.32);
        }
        .exportunity-google-user i {
          display: block;
          width: 28px;
          height: 28px;
          margin-top: 8px;
          border: 4px solid white;
          border-radius: 999px;
          background: #2563eb;
          box-shadow: 0 0 0 16px rgba(37,99,235,.18), 0 0 36px rgba(37,99,235,.78);
        }
      `}</style>
    </>
  );
}

function OpportunityCard({
  shop,
  dark,
  exchange,
  wholesale,
  active,
  onSelect,
}: {
  shop: CommerceShop;
  dark: boolean;
  exchange: boolean;
  wholesale: boolean;
  active: boolean;
  onSelect: (shop: CommerceShop) => void;
}) {
  const tone = getShopTone(shop.category);
  const visual = getCommerceCategoryVisual(shop.category, wholesale, exchange);
  const CategoryIcon = visual.Icon;
  return (
    <article
      className={cn(
        "group overflow-hidden rounded-2xl border transition hover:-translate-y-0.5",
        active
          ? "border-[#F5A623] shadow-[0_22px_50px_rgba(245,166,35,.20)]"
          : dark
            ? "border-white/10 bg-white/[0.035] hover:border-[#F5A623]/45"
            : "border-slate-200 bg-white hover:border-[#F5A623]/45 hover:shadow-[0_18px_44px_rgba(15,23,42,.10)]",
      )}
    >
      <button type="button" onClick={() => onSelect(shop)} className="block w-full text-left">
        <div className="relative h-28 overflow-hidden">
          <img src={shop.image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/62 via-black/4 to-transparent" />
          <span
            className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-white/70 bg-white/92 text-sm font-black shadow"
            style={{ color: tone.color }}
          >
            <CategoryIcon className="h-5 w-5" />
          </span>
          <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white">
            {exchange ? shop.investmentReadiness || "Review" : wholesale ? shop.contactStatus || "Quote" : shop.openLabel}
          </span>
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-base font-black">{shop.name}</div>
              <div className={cn("truncate text-sm", dark ? "text-white/58" : "text-slate-500")}>{shop.category}</div>
            </div>
            <div className="shrink-0 text-right text-sm font-black text-[#F5A623]">Rating {shop.rating.toFixed(1)}</div>
          </div>
          <div className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold", dark ? "text-white/64" : "text-slate-600")}>
            <span>{shop.distance}</span>
            <span>{shop.eta}</span>
            {shop.district ? <span>{shop.district}</span> : null}
          </div>
          {wholesale ? (
            <div className={cn("rounded-xl border px-3 py-2 text-xs", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-100 bg-slate-50")}>
              <span className="font-black">MOQ:</span> {shop.moq || "By quote"} - <span className="font-black">Lead:</span> {shop.leadTime || "Confirm"}
            </div>
          ) : null}
          {exchange ? (
            <div className={cn("line-clamp-2 text-xs leading-relaxed", dark ? "text-white/58" : "text-slate-600")}>
              {shop.merchantStory || `${shop.name} has a neighbourhood business profile ready for review.`}
            </div>
          ) : null}
          <div className="flex items-center justify-between pt-1">
            <span className={cn("text-xs font-bold", dark ? "text-white/52" : "text-slate-500")}>{shop.trustStatus || "Public listing"}</span>
            <span className="rounded-full bg-[#F5A623] px-3 py-1.5 text-xs font-black text-[#07111F]">
              {exchange ? "View seller" : wholesale ? "View supplier" : "Enter shop"}
            </span>
          </div>
        </div>
      </button>
    </article>
  );
}

function CinematicCloudLayer({ dark, mode }: { dark: boolean; mode: "idle" | "searching" | "focusingShop" | "enteringShop" }) {
  const opacity = mode === "idle" ? (dark ? 0.14 : 0.055) : mode === "searching" ? (dark ? 0.1 : 0.045) : dark ? 0.08 : 0.03;
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
      <div
        className={cn(
          "absolute -inset-x-[12%] -top-[20%] h-[24%] blur-3xl transition-all duration-700",
          dark
            ? "bg-[radial-gradient(ellipse_at_14%_48%,rgba(255,255,255,.22),transparent_34%),radial-gradient(ellipse_at_54%_8%,rgba(178,197,218,.12),transparent_36%),radial-gradient(ellipse_at_88%_42%,rgba(255,255,255,.18),transparent_34%)]"
            : "bg-[radial-gradient(ellipse_at_12%_48%,rgba(255,255,255,.42),transparent_42%),radial-gradient(ellipse_at_54%_8%,rgba(255,255,255,.24),transparent_42%),radial-gradient(ellipse_at_88%_42%,rgba(255,255,255,.38),transparent_40%)]",
        )}
        style={{ opacity, transform: mode === "idle" ? "translate3d(0,0,0)" : "translate3d(2%, -4%, 0)" }}
      />
      <div
        className={cn(
          "absolute -bottom-[24%] -left-[14%] h-[20%] w-[36%] rounded-full blur-3xl transition-all duration-700",
          dark ? "bg-white/7" : "bg-white/14",
        )}
        style={{ opacity: opacity * 0.75, transform: mode === "focusingShop" ? "translateX(-9%)" : "translateX(0)" }}
      />
      <div
        className={cn(
          "absolute -right-[18%] top-[18%] h-[28%] w-[24%] rounded-full blur-3xl transition-all duration-700",
          dark ? "bg-white/6" : "bg-white/8",
        )}
        style={{ opacity: opacity * 0.55, transform: mode === "enteringShop" ? "translateX(10%)" : "translateX(0)" }}
      />
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-700",
          dark
            ? "bg-[radial-gradient(circle_at_52%_43%,transparent_0,transparent_30%,rgba(5,7,11,.10)_68%,rgba(5,7,11,.42)_100%)]"
            : "bg-[radial-gradient(circle_at_52%_43%,transparent_0,transparent_32%,rgba(255,255,255,.03)_68%,rgba(255,255,255,.32)_100%)]",
        )}
        style={{ opacity: mode === "idle" ? (dark ? 0.12 : 0.06) : (dark ? 0.16 : 0.08) }}
      />
    </div>
  );
}

function AgentAvatar({ agent }: { agent: CommerceAgent }) {
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-white text-xs font-black" style={{ borderColor: agent.color, color: agent.color }}>
      {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : agent.name.slice(0, 2)}
      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" />
    </span>
  );
}

function MessageBubble({
  message,
  dark,
  activeShop,
}: {
  message: ConversationMessage;
  dark: boolean;
  activeShop?: CommerceShop | null;
}) {
  const isUser = message.agentId === "user";
  const agent = isUser
    ? null
    : message.agentSnapshot ||
      (activeShop && message.agentId === activeShop.frontDesk.id ? activeShop.frontDesk : null) ||
      agents[message.agentId] ||
      businessAgents.find((item) => item.id === message.agentId) ||
      agents.tassi;
  return (
    <div className={cn("flex items-start gap-3", isUser && "justify-end")}>
      {!isUser && agent ? <AgentAvatar agent={agent} /> : null}
      <div
        className={cn(
          "max-w-[88%] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-[0_18px_46px_rgba(15,23,42,.16)] backdrop-blur-xl",
          isUser
            ? "border-[#F5A623]/55 bg-[#F5A623]/92 text-[#07111F]"
            : dark
              ? "border-white/12 bg-[#07111F]/78 text-white"
              : "border-white/90 bg-white/86 text-slate-950",
        )}
      >
        {!isUser && agent ? (
          <div className={cn("mb-1 flex items-center gap-2 text-[12px] font-bold", dark ? "text-white/72" : "text-slate-600")}>
            <span className="text-[#F5A623]">{agent.name}</span>
            <span>{agent.role}</span>
          </div>
        ) : null}
        {message.imageUrl ? <img src={message.imageUrl} alt="Attached product" className="mb-3 max-h-44 rounded-xl object-cover" /> : null}
        <div>{message.content}</div>
      </div>
    </div>
  );
}

function BusinessConversation({ dark }: { dark: boolean }) {
  const updates = [
    ["front-desk", "We have 23 customer visits and 8 conversations active today. Top question: whole wheat bread."],
    ["inventory", "Whole wheat bread is low. Croissants and brown eggs should be reordered before 11 AM."],
    ["accountant", "Today's sales are 142,500 XAF across 31 transactions. Cash flow is healthy."],
    ["delivery-lead", "Two deliveries are completed. Next stop is Riviera 3 in 6 minutes."],
    ["marketing", "Breakfast Bundle is ready for tomorrow: bread, eggs, and juice at 3,500 XAF."],
  ];
  return (
    <section className={cn("absolute inset-x-3 bottom-32 top-24 z-30 overflow-hidden rounded-2xl border backdrop-blur-xl md:left-28 md:right-8", dark ? "border-white/12 bg-[#07111F]/88 text-white" : "border-white bg-white/92 text-slate-950 shadow-[0_20px_60px_rgba(15,23,42,.13)]")}>
      <div className="flex items-center justify-between border-b border-current/10 px-5 py-4">
        <div>
          <div className="text-xl font-black">My Business</div>
          <div className={cn("text-sm", dark ? "text-white/62" : "text-slate-600")}>Le Pain Dore business workspace with your operating agents</div>
        </div>
        <div className="hidden gap-2 lg:flex">
          {businessAgents.slice(0, 5).map((agent) => <AgentAvatar key={agent.id} agent={agent} />)}
        </div>
      </div>
      <div className="grid h-[calc(100%-73px)] grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-auto p-5">
          <div className="space-y-4">
            {updates.map(([agentId, content]) => (
              <MessageBubble key={agentId} message={{ id: agentId, agentId, content, createdAt: "today" }} dark={dark} />
            ))}
          </div>
        </div>
        <aside className={cn("hidden border-l border-current/10 p-4 lg:block", dark ? "bg-white/[0.03]" : "bg-slate-50/86")}>
          <div className="text-sm font-bold">Today at a glance</div>
          <div className="mt-4 space-y-3 text-sm">
            {[
              ["Sales", "142,500 XAF"],
              ["Orders", "31"],
              ["Customers", "23"],
              ["Low stock", "3 items"],
              ["Deliveries", "2 completed"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <span className={dark ? "text-white/62" : "text-slate-600"}>{label}</span>
                <span className="font-bold">{value}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function ExportunityConversationalCommerce({
  onNavigate,
  isAdmin = false,
  initialSpace = "city",
  embeddedShell = false,
  shellMode = "commerce",
}: ExportunityConversationalCommerceProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return (window.localStorage.getItem("exportunity-map-theme") as ThemeMode | null) || "light";
  });
  const [space, setSpace] = useState<ConversationSpace>(initialSpace);
  const [userLocation, setUserLocation] = useState<[number, number]>(ABIDJAN_COCODY);
  const [activeShop, setActiveShop] = useState<CommerceShop | null>(null);
  const [resultsVisible, setResultsVisible] = useState(true);
  const [videoOpen, setVideoOpen] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>(() =>
    initialSpace === "exchange"
      ? [
          { id: "exchange-hi", agentId: "tassi", content: "I'm Tassi. Welcome to Ready for export.", createdAt: "now" },
          { id: "exchange-context", agentId: "tassi", content: "I can help you discover trusted sellers, read merchant stories, and identify products ready for export. Finance stays internal-review and compliance-gated.", createdAt: "now" },
        ]
      : initialSpace === "wholesale"
      ? [
          { id: "wholesale-hi", agentId: "tassi", content: "I'm Tassi. Are you buying wholesale, looking for a supplier, or trying to sell in bulk?", createdAt: "now" },
          { id: "wholesale-context", agentId: "tassi", content: "I can compare suppliers, MOQ, lead time, delivery routes, verification, and quote options around Abidjan.", createdAt: "now" },
        ]
      : initialMessages,
  );
  const [input, setInput] = useState("");
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "speaking" | "unavailable">("idle");
  const [isSearching, setIsSearching] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState<null | { product: string; quantity: string; status: string; suppliers: CommerceShop[] }>(null);
  const [shopOrderDrafts, setShopOrderDrafts] = useState<Record<string, Record<string, ShopOrderLine>>>({});
  const [googleMarketplacePlaces, setGoogleMarketplacePlaces] = useState<CommerceShop[]>([]);
  const [googleWholesalePlaces, setGoogleWholesalePlaces] = useState<CommerceShop[]>([]);
  const [marketplaceData, setMarketplaceData] = useState<PublicPlacesState>({
    provider: "curated",
    label: "Curated city data",
    detail: "Nearby shops are available now, with richer live business discovery when Google Places is connected.",
  });
  const [wholesaleData, setWholesaleData] = useState<PublicPlacesState>({
    provider: "curated",
    label: "Curated supplier data",
    detail: "Supplier, warehouse, and logistics records are available now, with live discovery when Google Places is connected.",
  });
  const [mapsConfig, setMapsConfig] = useState<PublicMapsConfig>({
    provider: "leaflet",
    enabled: false,
    apiKey: null,
  });
  const [mapProviderIssue, setMapProviderIssue] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dark = themeMode === "dark";
  const wholesale = space === "wholesale";
  const exchange = space === "exchange";
  const places = exchange ? exchangePlaces : wholesale ? (googleWholesalePlaces.length ? googleWholesalePlaces : wholesaleSuppliers) : (googleMarketplacePlaces.length ? googleMarketplacePlaces : shops);
  const visiblePlaces = useMemo(() => (resultsVisible ? places.slice(0, exchange ? 16 : wholesale ? 14 : 10) : places.slice(0, 5)), [exchange, places, resultsVisible, wholesale]);
  const activeShopProducts = useMemo(() => (activeShop ? getProductsForShop(activeShop) : []), [activeShop]);
  const activeShopOrder = useMemo(() => (activeShop ? shopOrderDrafts[activeShop.id] || {} : {}), [activeShop, shopOrderDrafts]);
  const activeShopOrderEntries = useMemo(() => Object.values(activeShopOrder), [activeShopOrder]);
  const activeShopSubtotal = useMemo(
    () => activeShopOrderEntries.reduce((sum, line) => sum + line.product.priceCfa * line.quantity, 0),
    [activeShopOrderEntries],
  );
  const activeAgents = useMemo(() => {
    if (space === "business") return [agents.tassi, ...businessAgents.slice(0, 4)];
    const base = exchange ? [agents.tassi, agents.guide, agents.wallet] : wholesale ? [agents.tassi, agents.supplier, agents.wallet] : [agents.tassi, agents.guide];
    if (!activeShop) return base;
    return [agents.tassi, activeShop.frontDesk, agents.koffi, agents.wallet];
  }, [activeShop, exchange, space, wholesale]);
  const routePoints = activeShop ? [userLocation, activeShop.position] : [userLocation, places[0].position, places[1].position];
  const cloudMode = activeShop ? "focusingShop" : isSearching ? "searching" : "idle";
  const quickReplies = space === "business" ? businessQuickReplies : space === "shop" ? shopQuickReplies : exchange ? exchangeQuickReplies : wholesale ? wholesaleQuickReplies : cityQuickReplies;
  const activeData = wholesale ? wholesaleData : marketplaceData;
  const googleMapEnabled = Boolean(mapsConfig.enabled && mapsConfig.provider === "google" && mapsConfig.apiKey);
  const activeMapId = dark ? mapsConfig.mapIdDark || mapsConfig.mapIdLight || undefined : mapsConfig.mapIdLight || undefined;
  const shopMode = space === "shop" && !!activeShop;
  const businessLeadAgent = businessAgents[0];
  const visibleConversationAgent = shopMode && activeShop ? activeShop.frontDesk : space === "business" ? businessLeadAgent : agents.tassi;
  const mapDominant = shellMode === "mapDominant";
  const mapHeaderTitle = exchange ? "Ready for export" : wholesale ? "Wholesale suppliers" : "Nearby products";
  const mapHeaderInstruction = exchange
    ? "Review export-ready sellers, products, owner proof, and trust signals before any next step."
    : wholesale
      ? "Tap a supplier to inspect MOQ, lead time, logistics, and request a quote."
      : "Tap a shop to enter, browse products, and place an order with the shop agent.";
  const composerPlaceholder = shopMode
    ? `Message ${visibleConversationAgent.name} about these products...`
    : space === "business"
      ? "Tell your business agents what to handle next..."
      : wholesale
        ? "Search suppliers, bulk products, MOQ, or logistics..."
        : exchange
          ? "Search export-ready sellers, products, or trust signals..."
          : "Search products, shops, delivery, or suppliers nearby...";

  useEffect(() => {
    window.localStorage.setItem("exportunity-map-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    let cancelled = false;
    async function loadMapsConfig() {
      try {
        const response = await fetch("/api/maps/public-config");
        const body = (await response.json()) as PublicMapsConfig;
        if (!cancelled && body?.provider) {
          setMapsConfig(body);
          if (body.provider === "leaflet") {
            setMapProviderIssue(body?.message || "Google Maps is currently not active. OpenStreetMap city map is running.");
          } else {
            setMapProviderIssue(null);
          }
        } else if (!cancelled) {
          setMapProviderIssue("Unable to read map configuration. The city map is active.");
        }
      } catch {
        if (!cancelled) {
          setMapProviderIssue("Google Maps configuration could not be read. The live OpenStreetMap city map is active.");
          setMapsConfig({
            provider: "leaflet",
            enabled: false,
            apiKey: null,
            message: "Google Maps rendering is unavailable. The public city map is active.",
          });
        }
      }
    }
    void loadMapsConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setUserLocation([position.coords.latitude, position.coords.longitude]),
      () => undefined,
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 1000 * 60 * 10 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadGooglePlaces() {
      try {
        const [marketplace, wholesalePlaces] = await Promise.all([
          fetch("/api/places/nearby?city=Abidjan&type=marketplace&q=bakery%20cafe%20grocery%20pharmacy%20hardware%20store").then((res) => res.json()),
          fetch("/api/places/nearby?city=Abidjan&type=wholesale&q=wholesale%20supplier%20distributor%20warehouse%20logistics").then((res) => res.json()),
        ]);
        if (cancelled) return;
        if (marketplace?.provider === "google" && Array.isArray(marketplace.items)) {
          setGoogleMarketplacePlaces(marketplace.items.map((item: any, index: number) => googlePlaceToShop(item, index, "marketplace")).filter(Boolean));
          setMarketplaceData({
            provider: "google",
            label: "Google Places connected",
            detail: "Live public business listings are feeding this map.",
            lastSyncTime: marketplace.lastSyncTime,
          });
        } else {
          if (marketplace?.message && !mapProviderIssue) {
            setMapProviderIssue(`Search: ${marketplace.message}`);
          }
          setMarketplaceData({
            provider: "curated",
            label: "Curated city data",
            detail: "Nearby shops are available now, with richer live business discovery when Google Places is connected.",
          });
        }
        if (wholesalePlaces?.provider === "google" && Array.isArray(wholesalePlaces.items)) {
          setGoogleWholesalePlaces(wholesalePlaces.items.map((item: any, index: number) => googlePlaceToShop(item, index, "wholesale")).filter(Boolean));
          setWholesaleData({
            provider: "google",
            label: "Google Places connected",
            detail: "Live supplier and logistics listings are feeding this map.",
            lastSyncTime: wholesalePlaces.lastSyncTime,
          });
        } else {
          if (wholesalePlaces?.message && !mapProviderIssue) {
            setMapProviderIssue(wholesalePlaces.message);
          }
          setWholesaleData({
            provider: "curated",
            label: "Curated supplier data",
            detail: "Supplier, warehouse, and logistics records are available now, with live discovery when Google Places is connected.",
          });
        }
      } catch {
        setMarketplaceData({
          provider: "curated",
          label: "Curated city data",
          detail: "Live Google data is temporarily unavailable; Exportunity is using curated city records.",
        });
        setWholesaleData({
          provider: "curated",
          label: "Curated supplier data",
          detail: "Live Google data is temporarily unavailable; Exportunity is using curated supplier records.",
        });
      }
    }
    void loadGooglePlaces();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSpace(initialSpace);
    setActiveShop(null);
  }, [initialSpace]);

  useEffect(() => {
    const pageLabel = activeShop ? `${activeShop.name} conversation` : space === "business" ? "My Business group chat" : exchange ? "Ready for export map" : wholesale ? "Wholesale supplier map" : "Exportunity map";
    window.dispatchEvent(
      new CustomEvent("chairman-dock:context", {
        detail: {
          pageKey: space === "business" ? "exportunity-business" : activeShop ? `shop:${activeShop.id}` : exchange ? "exportunity-pme-exchange" : wholesale ? "exportunity-wholesale-map" : "exportunity-map",
          pageLabel,
          managerName: activeShop?.frontDesk.name || "Tassi",
          managerRole: activeShop?.frontDesk.role || "Concierge",
        },
      }),
    );
  }, [activeShop, exchange, space, wholesale]);

  const pushMessage = (message: Omit<ConversationMessage, "id" | "createdAt">) => {
    setMessages((current) => [...current.slice(-5), { ...message, id: `${Date.now()}-${Math.random()}`, createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
  };

  const replyAsTassi = (text: string, shop?: CommerceShop) => {
    window.setTimeout(() => {
      pushMessage({
        agentId: shop?.frontDesk.id || "tassi",
        content: text,
        shopId: shop?.id,
        agentSnapshot: shop?.frontDesk,
      });
      setVoiceState((state) => (state === "speaking" ? "idle" : state));
    }, 260);
  };

  const formatCurrency = (value: number) => `${Intl.NumberFormat("en-US").format(Math.round(value))} XAF`;

  const setOrderQuantity = (shop: CommerceShop, product: ShopProduct, quantity: number) => {
    setShopOrderDrafts((previous) => {
      const next = { ...previous };
      const currentShopDraft = { ...(previous[shop.id] || {}) };
      const safeQty = Math.max(0, Math.min(product.quantityAvailable, quantity));
      if (safeQty <= 0) {
        delete currentShopDraft[product.id];
      } else {
        currentShopDraft[product.id] = { product, quantity: safeQty };
      }
      if (!Object.keys(currentShopDraft).length) {
        delete next[shop.id];
      } else {
        next[shop.id] = currentShopDraft;
      }
      return next;
    });
  };

  const submitShopOrder = () => {
    if (!activeShop) return;
    if (!activeShopOrderEntries.length) {
      replyAsTassi("Select a quantity for one or more products first, then I can confirm your order with the shop.", activeShop);
      return;
    }
    const ordered = activeShopOrderEntries.map((line) => `${line.product.name} x${line.quantity}`).join(", ");
    setShopOrderDrafts((previous) => {
      const next = { ...previous };
      delete next[activeShop.id];
      return next;
    });
    pushMessage({ agentId: "user", content: `Place order at ${activeShop.name}: ${ordered}`, shopId: activeShop.id });
    replyAsTassi(`I am confirming your order for ${ordered}. Total is ${formatCurrency(activeShopSubtotal)}. I can add delivery notes before dispatch if needed.`, activeShop);
  };

  const handleAsk = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setInput("");
    setResultsVisible(true);
    setIsSearching(true);
    pushMessage({ agentId: "user", content: text, shopId: shopMode && activeShop ? activeShop.id : undefined });
    const flow = findConversationFlow(text, wholesale ? "wholesale" : space);
    const lower = text.toLowerCase();
    const needsWholesale = lower.includes("wholesale") || lower.includes("supplier") || lower.includes("bulk") || lower.includes("quote") || lower.includes("moq");
    const needsExchange = lower.includes("pme") || lower.includes("sme") || lower.includes("invest") || lower.includes("verified") || lower.includes("verification") || lower.includes("businesses");
    if (needsWholesale && space !== "wholesale") {
      setSpace("wholesale");
      setActiveShop(null);
    }
    if (needsExchange && space !== "exchange") {
      setSpace("exchange");
      setActiveShop(null);
    }
    window.setTimeout(() => setIsSearching(false), 900);
    if (space === "business") {
      window.setTimeout(() => {
        pushMessage({
          agentId: businessLeadAgent.id,
          agentSnapshot: businessLeadAgent,
          content: "Front Desk: I shared this with the operating agents. Inventory, Accountant, Delivery Lead, and Marketing can turn it into tasks, stock checks, follow-ups, or customer replies.",
        });
      }, 260);
      return;
    }
    if (shopMode && activeShop) {
      if (lower.includes("video") || lower.includes("live")) {
        setVideoOpen(true);
        replyAsTassi("I can show you the product live from the shop. This call is live and not recorded.", activeShop);
        return;
      }
      if (lower.includes("wallet") || lower.includes("pay")) {
        window.setTimeout(() => pushMessage({ agentId: "wallet", content: "Wallet/Accountant: I can explain balance, receipts, and payment before you confirm.", shopId: activeShop.id }), 300);
        return;
      }
      if (lower.includes("deliver")) {
        window.setTimeout(() => pushMessage({ agentId: "koffi", content: `Delivery: ${activeShop.name} can deliver to Cocody. Estimated route time is ${activeShop.eta}.`, shopId: activeShop.id }), 300);
        return;
      }
      replyAsTassi(`Here are the products available at ${activeShop.name}. Choose quantities in the shop view, or tell me what you need and I will guide you.`, activeShop);
      return;
    }
    if (needsWholesale && (lower.includes("cement") || lower.includes("bags") || /\b\d{2,}\b/.test(lower))) {
      const candidates = wholesaleSuppliers.filter((shop) => /building|material|cement|btp/i.test(`${shop.category} ${shop.name}`)).slice(0, 4);
      setQuoteDraft({
        product: lower.includes("cement") ? "Cement" : "Wholesale product",
        quantity: lower.match(/\b\d{2,}\b/)?.[0] ? `${lower.match(/\b\d{2,}\b/)?.[0]} units` : "Quantity to confirm",
        status: "Awaiting approval before supplier outreach",
        suppliers: candidates.length ? candidates : wholesaleSuppliers.slice(0, 4),
      });
      replyAsTassi("I created a quote draft and found suppliers nearby. No supplier will be contacted until you approve the outreach message.");
      window.setTimeout(() => pushMessage({ agentId: "supplier-agent", content: "Sourcing Agent: I can compare fastest delivery, verified suppliers, or lowest estimated price. Approval is required before WhatsApp, email, or call outreach." }), 620);
      return;
    }
    if (lower.includes("video") || lower.includes("live")) {
      setVideoOpen(true);
      replyAsTassi("I can open a live product preview with the shop. This call is live and not recorded.");
      return;
    }
    if (lower.includes("wallet") || lower.includes("pay")) {
      replyAsTassi("Wallet can cover this. Your accountant agent can explain balance, spending, receipts, and the best payment option before you confirm.");
      return;
    }
    const target = needsExchange ? exchangePlaces[0] : needsWholesale ? wholesaleSuppliers[0] : lower.includes("coffee") ? shops[1] : lower.includes("material") || lower.includes("building") ? shops[3] : shops[0];
    if (flow) {
      replyAsTassi(flow.assistantPrompt);
    } else {
      replyAsTassi(needsExchange ? "I highlighted nearby export-ready sellers with trust signals, neighbourhood story, and internal finance-readiness status. Tap one to inspect products and proof before taking any next step." : needsWholesale ? "I found verified suppliers around Abidjan. You can compare MOQ, lead time, distance, and ask for a quote through the conversation." : "I found nearby options and highlighted the best matches on the map. Tap a marker to speak with that shop.");
    }
    if (lower.includes("breakfast") || lower.includes("bread") || lower.includes("coffee") || needsWholesale || needsExchange || lower.includes("material")) {
      window.setTimeout(() => setActiveShop(target), 520);
    }
  };

  const selectShop = (shop: CommerceShop) => {
    setSpace(exchange ? "exchange" : wholesale ? "wholesale" : "shop");
    setActiveShop(shop);
    setResultsVisible(true);
    setIsSearching(false);
    if (exchange || wholesale) {
      pushMessage({
        agentId: "tassi",
        content: exchange
          ? `I found ${shop.name}. ${shop.trustStatus || "export-ready profile"} and ${shop.investmentReadiness || "internal review"} are visible.`
          : `I found ${shop.name}. ${shop.moq || "Bulk terms available"} and ${shop.leadTime || "quote desk open"}.`,
      });
      replyAsTassi(
        exchange
          ? `${shop.merchantStory || `${shop.name} has a neighbourhood business profile.`} We can review the seller profile, contact status, export readiness, and compliance-gated eligibility before any finance action.`
          : `Welcome to ${shop.name}. I can share stock, MOQ, quote timing, and logistics options. What quantity do you need?`,
        shop,
      );
    } else {
      pushMessage({
        agentId: shop.frontDesk.id,
        content: `Welcome to ${shop.name}. I'm ${shop.frontDesk.name}, the shop Front Desk. Products are open now; choose what you want and I will help with payment or delivery.`,
        shopId: shop.id,
        agentSnapshot: shop.frontDesk,
      });
    }
    if (!shopOrderDrafts[shop.id]) {
      setShopOrderDrafts((previous) => ({ ...previous, [shop.id]: previous[shop.id] || {} }));
    }
  };

  const handleQuickReply = (text: string) => {
    if (text === "Request a quote") {
      handleAsk("I need a wholesale quote for 200 bags of cement");
      return;
    }
    if (text === "Approve outreach" && quoteDraft) {
      setQuoteDraft({ ...quoteDraft, status: "Outreach draft approved for manual send queue" });
      pushMessage({ agentId: "user", content: "Approve outreach" });
      replyAsTassi("Approved. I placed the supplier outreach in the controlled queue with audit logging and do-not-contact checks.");
      return;
    }
    if (text === "Can I see it live?") {
      handleAsk("Can I see it live?");
      return;
    }
    handleAsk(text);
  };

  const startVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceState("unavailable");
      replyAsTassi(`Voice input is not available in this browser. You can type to ${shopMode && activeShop ? activeShop.frontDesk.name : "Tassi"} here.`, activeShop || undefined);
      window.setTimeout(() => setVoiceState("idle"), 2400);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoiceState("listening");
    recognition.onerror = () => setVoiceState("idle");
    recognition.onend = () => setVoiceState("idle");
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) handleAsk(transcript);
    };
    recognition.start();
  };

  const handlePhoto = (file: File | undefined) => {
    if (!file) return;
    const imageUrl = URL.createObjectURL(file);
    pushMessage({ agentId: "user", content: "Can you find this around me?", imageUrl });
    setResultsVisible(true);
    replyAsTassi("I can inspect the image and search nearby matches. This looks like a product request, so I highlighted relevant shops and supplier options around you.");
  };

  const visibleMessages = shopMode && activeShop
    ? messages
      .filter((message) => message.shopId === activeShop.id || message.agentId === activeShop.frontDesk.id)
      .slice(-8)
    : messages.slice(-8);

  return (
    <div className={cn("flex flex-col overflow-hidden", embeddedShell ? "h-full min-h-0 pt-[64px]" : "h-[100dvh] min-h-[100dvh]", dark ? "bg-[#05070B] text-white" : "bg-[#F7F8FA] text-slate-950")}>
      <style>{`
        .exportunity-route-line{stroke-dasharray:18 18;animation:exportunity-route-flow 1.35s linear infinite;filter:drop-shadow(0 0 9px rgba(245,166,35,.45));}
        .exportunity-route-glow{filter:drop-shadow(0 0 20px rgba(245,166,35,.64));}
        .exportunity-shop-marker img{filter:saturate(1.08) contrast(1.04);}
        .leaflet-control-attribution{font-size:10px;}
        .leaflet-popup-content-wrapper{border-radius:12px;box-shadow:0 22px 50px rgba(15,23,42,.22);}
        @keyframes exportunity-route-flow{to{stroke-dashoffset:-36;}}
      `}</style>

      {!embeddedShell ? <header className={cn("z-40 flex h-[74px] shrink-0 items-center gap-4 border-b px-4 shadow-[0_18px_50px_rgba(5,7,11,.22)] lg:px-6", dark ? "border-white/10 bg-[#05070B] text-white" : "border-slate-200 bg-[#F7F8FA] text-slate-900")}>
        <button type="button" onClick={() => { setSpace("city"); setActiveShop(null); }} className="flex min-w-[220px] items-center gap-3" aria-label="Exportunity map">
          <img
            src={dark ? "/tenants/exportunity/official/logo-long-transparent.png" : "/tenants/exportunity/official/logo-long-light.png"}
            alt="Exportunity AI"
            className="h-11 w-auto max-w-[220px] object-contain"
          />
        </button>
        <nav className={cn("hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex")}>
          {[
            ["Map", MapIcon, "city"],
            ["Shops", Store, "shop"],
            ["Wholesale", Warehouse, "wholesale"],
            ["Ready for export", Search, "exchange"],
            ["My Business", BriefcaseBusiness, "business"],
            ["Orders", Truck, "orders"],
            ["Wallet", Package, "wallet"],
          ].map(([label, Icon, key]) => (
            <button
              key={String(label)}
              type="button"
              onClick={() => {
                if (key === "business") setSpace("business");
                else if (key === "wholesale") {
                  setSpace("wholesale");
                  setActiveShop(null);
                  onNavigate?.("/wholesale");
                } else if (key === "exchange") {
                  setSpace("exchange");
                  setActiveShop(null);
                  onNavigate?.("/ready-for-export");
                } else if (key === "shop") {
                  setSpace("city");
                  setActiveShop(null);
                  onNavigate?.("/marketplace");
                }
                else if (key === "orders") onNavigate?.("/orders");
                else if (key === "wallet") onNavigate?.("/wallet");
                else {
                  setSpace("city");
                  setActiveShop(null);
                  if (key === "city") onNavigate?.("/map");
                }
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition",
                key === space
                  ? "bg-[#F5A623] text-[#07111F]"
                  : dark
                    ? "text-white/68 hover:bg-white/8 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon className="h-4 w-4" />
              {String(label)}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={cn("hidden h-11 items-center gap-2 rounded-full border border-current/20 bg-transparent px-4 text-sm font-semibold md:inline-flex", dark ? "text-white/68" : "text-slate-700")}>
            <MapPin className="h-4 w-4" /> Cocody, Abidjan <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setThemeMode(dark ? "light" : "dark")} className={cn("grid h-11 w-11 place-items-center rounded-full border", dark ? "border-white/12 bg-white/5 text-[#F5A623]" : "border-slate-300 bg-slate-100 text-slate-800")} aria-label="Toggle map theme">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          {isAdmin ? <span className="hidden rounded-full bg-[#F5A623] px-2 py-1 text-xs font-bold text-black md:inline-flex">Admin</span> : null}
        </div>
      </header> : null}

      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden",
          mapDominant
            ? "lg:grid-cols-[72px_minmax(0,1fr)_320px] xl:grid-cols-[80px_minmax(0,1fr)_340px]"
            : "lg:grid-cols-[80px_minmax(0,1fr)_340px] xl:grid-cols-[88px_minmax(0,1fr)_360px]",
        )}
      >
        <aside className={cn("hidden border-r px-3 py-5 lg:flex lg:flex-col lg:items-center lg:gap-4", dark ? "border-white/10 bg-[#07111F]" : "border-slate-200 bg-white")}>
          {[
            { key: "city", label: "Map", icon: MapIcon, action: () => { setSpace("city"); setActiveShop(null); onNavigate?.("/map"); } },
            { key: "find", label: "Find", icon: Search, action: () => handleQuickReply("Find breakfast near me") },
            {
              key: "wholesale",
              label: "Wholesale",
              icon: Warehouse,
              action: () => {
                setSpace("wholesale");
                setActiveShop(null);
                onNavigate?.("/wholesale");
              },
            },
            {
              key: "exchange",
              label: "Export",
              icon: BriefcaseBusiness,
              action: () => {
                setSpace("exchange");
                setActiveShop(null);
                onNavigate?.("/ready-for-export");
              },
            },
            { key: "business", label: "Business", icon: Store, action: () => setSpace("business") },
          ].map(({ key, label, icon: Icon, action }) => {
            const active = key === space || (key === "city" && space === "shop");
            return (
            <button
              key={label}
              type="button"
              onClick={action}
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-2xl px-2 py-3 text-[11px] font-black transition hover:-translate-y-0.5",
                active
                  ? "bg-[#F5A623]/14 text-[#F5A623] ring-1 ring-[#F5A623]/35"
                  : dark
                    ? "text-white/70 hover:bg-white/8 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              <span className={cn(
                "grid h-11 w-11 place-items-center rounded-2xl shadow-[0_12px_24px_rgba(245,166,35,.24)]",
                active ? "bg-[#F5A623] text-[#07111F]" : dark ? "bg-white/8 text-white" : "bg-slate-100 text-slate-800",
              )}>
                <Icon className="h-5 w-5" />
              </span>
              {label}
            </button>
          );})}
        </aside>

        <main className={cn("relative min-h-0 overflow-hidden", dark ? "bg-[#05070B]" : "bg-[#F7F8FA]")}>
          <section className={cn("relative h-full min-h-[560px] w-full overflow-hidden border-t xl:border-l-0 lg:border-b", dark ? "border-slate-700/40" : "border-slate-200")}>
            {googleMapEnabled && mapsConfig.apiKey ? (
              <GoogleMapsCanvas
                apiKey={mapsConfig.apiKey}
                mapId={activeMapId}
                userLocation={userLocation}
                activeShop={activeShop}
                resultsVisible={resultsVisible}
                places={places}
                visiblePlaces={visiblePlaces}
                routePoints={routePoints}
                dark={dark}
                wholesale={wholesale}
                exchange={exchange}
                onSelect={selectShop}
                onProviderError={() => {
                  setMapProviderIssue("Google Maps rejected the browser key or map setup. The live OpenStreetMap city map is active while Google is corrected.");
                  setMapsConfig({
                    provider: "leaflet",
                    enabled: false,
                    apiKey: null,
                    message: "Google Maps could not load. The public city map is active.",
                  });
                }}
              />
            ) : (
              <MapContainer center={userLocation} zoom={13} className="h-full w-full" zoomControl={false}>
                <TileLayer
                  key={dark ? "dark" : "light"}
                  attribution="&copy; OpenStreetMap &copy; CARTO"
                  url={dark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
                />
                <MapFocus userLocation={userLocation} activeShop={activeShop} resultsVisible={resultsVisible} places={places} />
                <Polyline positions={routePoints} pathOptions={{ color: "#F5A623", weight: 7, opacity: 0.18, className: "exportunity-route-glow" }} />
                <Polyline positions={routePoints} pathOptions={{ color: "#F5A623", weight: 3, opacity: 0.85, className: "exportunity-route-line" }} />
                <Marker position={userLocation} icon={makeUserIcon()} />
                {visiblePlaces.map((shop) => {
                  const isActive = activeShop?.id === shop.id;
                  return (
                    <Marker
                      key={`${shop.id}-${isActive}-${dark}-${wholesale}-${exchange}`}
                      position={shop.position}
                      icon={isActive ? makeShopIcon(shop, true, dark, wholesale, exchange) : makeCompactShopIcon(shop, false, dark, wholesale, exchange)}
                      eventHandlers={{ click: () => selectShop(shop) }}
                    >
                      <Popup>
                        <div className="min-w-[220px]">
                          <img src={shop.image} alt="" className="mb-2 h-24 w-full rounded-md object-cover" />
                          <div className="font-semibold">{shop.name}</div>
                          <div className="text-sm text-slate-500">{shop.category}</div>
                          <div className="mt-1 text-sm">{shop.distance} | {shop.eta}</div>
                          {shop.moq ? <div className="mt-1 text-sm">{shop.moq} | {shop.leadTime}</div> : null}
                          <button
                            type="button"
                            onClick={() => selectShop(shop)}
                            className="mt-3 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-[#F5A623] hover:text-[#F5A623]"
                          >
                            {exchange ? "View seller" : wholesale ? "View supplier" : "Enter shop"}
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}
            <div className={cn("pointer-events-none absolute inset-0 z-[1]", dark ? "bg-[linear-gradient(180deg,rgba(5,7,11,.24),transparent_46%,rgba(5,7,11,.18))]" : "bg-[linear-gradient(180deg,rgba(255,255,255,.10),transparent_46%,rgba(255,255,255,.12))]")} />
            <CinematicCloudLayer dark={dark} mode={cloudMode} />
            <div className="pointer-events-none absolute left-4 top-4 z-[4] max-w-[560px]">
              <div className={cn("rounded-2xl border px-4 py-3 backdrop-blur-xl", dark ? "border-white/10 bg-[#07111F]/72 text-white" : "border-white/90 bg-white/82 text-slate-950 shadow-[0_18px_44px_rgba(15,23,42,.12)]")}>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-[#F5A623]">{exchange ? "Ready for export" : wholesale ? "Wholesale map" : "Live neighbourhood map"}</div>
                <div className="mt-1 text-lg font-black">{visiblePlaces.length} {mapHeaderTitle} around Cocody</div>
                <div className={cn("mt-1 text-xs font-semibold", dark ? "text-white/62" : "text-slate-600")}>{mapHeaderInstruction}</div>
                <div className={cn("mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black", googleMapEnabled || activeData.provider === "google" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : dark ? "border-white/12 bg-white/8 text-white/78" : "border-slate-200 bg-white/86 text-slate-700")}>
                  <span className={cn("h-2 w-2 rounded-full", googleMapEnabled || activeData.provider === "google" ? "bg-emerald-500" : "bg-[#F5A623]")} />
                  {googleMapEnabled ? "Google Maps active" : activeData.provider === "google" ? "Live listings active" : "City map active"}
                </div>
                {mapProviderIssue ? (
                  <div className={cn("mt-2 max-w-[390px] rounded-xl border px-3 py-2 text-[11px] font-semibold leading-relaxed", dark ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-950")}>
                    {mapProviderIssue}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="absolute left-4 top-32 z-[4] flex max-w-[calc(100%-2rem)] gap-2 overflow-x-auto pb-1">
              {(exchange
                ? ["Verified sellers", "Fashion", "Food", "Women-led", "Proof signals", "Near Cocody"]
                : wholesale
                  ? ["Suppliers", "Request a quote", "Materials", "Machinery", "Packaging", "Logistics"]
                  : ["Breakfast", "Fresh bread", "Coffee", "Groceries", "Building materials", "Send to family"]
              ).map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleQuickReply(label === "Request a quote" ? "Request a quote" : label)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-2 text-xs font-black transition hover:-translate-y-0.5",
                    dark ? "border-white/12 bg-[#0A1628]/70 text-white/86 hover:border-[#F5A623]/60" : "border-slate-200 bg-white/90 text-slate-700 hover:border-[#F5A623]/50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="absolute right-4 top-4 z-[4] flex gap-2">
              <button type="button" onClick={() => setUserLocation(ABIDJAN_COCODY)} className={cn("grid h-11 w-11 place-items-center rounded-full border backdrop-blur-xl", dark ? "border-white/10 bg-[#07111F]/70 text-white" : "border-white/90 bg-white/86 text-slate-900")} aria-label="Center map"><Compass className="h-5 w-5" /></button>
              <button type="button" onClick={() => { setResultsVisible(true); setActiveShop(null); }} className={cn("grid h-11 w-11 place-items-center rounded-full border backdrop-blur-xl", dark ? "border-white/10 bg-[#07111F]/70 text-white" : "border-white/90 bg-white/86 text-slate-900")} aria-label="Reset map"><Navigation className="h-5 w-5" /></button>
            </div>
            {shopMode && activeShop ? (
              <div
                className={cn(
                  "absolute inset-x-4 bottom-5 top-24 z-[6] overflow-hidden rounded-[28px] border backdrop-blur-2xl md:inset-x-6 lg:top-20",
                  dark
                    ? "border-white/14 bg-[#07111F]/88 text-white shadow-[0_26px_80px_rgba(0,0,0,.46)]"
                    : "border-white/95 bg-white/92 text-slate-950 shadow-[0_26px_80px_rgba(15,23,42,.18)]",
                )}
              >
                <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="min-h-0 overflow-auto p-4 md:p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <img src={activeShop.image} alt="" className="h-24 w-28 shrink-0 rounded-2xl object-cover md:h-28 md:w-36" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#F5A623] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#07111F]">
                              In shop
                            </span>
                            <span className={cn("rounded-full border px-3 py-1 text-[11px] font-black", dark ? "border-white/14 text-white/72" : "border-slate-200 text-slate-600")}>
                              {activeShop.distance} • {activeShop.eta}
                            </span>
                          </div>
                          <h2 className="mt-3 truncate text-2xl font-black">{activeShop.name}</h2>
                          <p className={cn("mt-1 text-sm font-semibold", dark ? "text-white/62" : "text-slate-600")}>
                            {activeShop.category} • {activeShop.openLabel} • Rating {activeShop.rating.toFixed(1)}
                          </p>
                          <p className={cn("mt-3 max-w-2xl text-sm leading-relaxed", dark ? "text-white/64" : "text-slate-600")}>
                            Products are available now. Choose quantities here; {activeShop.frontDesk.name}, the shop Front Desk, will help with payment, delivery, and substitutions.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSpace("city");
                          setActiveShop(null);
                        }}
                        className={cn(
                          "shrink-0 rounded-full border px-4 py-2 text-sm font-black",
                          dark ? "border-white/14 text-white/76 hover:bg-white/8" : "border-slate-200 text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        Back to map
                      </button>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                      {activeShopProducts.map((product) => {
                        const quantity = activeShopOrder[product.id]?.quantity || 0;
                        return (
                          <article
                            key={product.id}
                            className={cn(
                              "overflow-hidden rounded-2xl border",
                              dark ? "border-white/12 bg-white/[0.045]" : "border-slate-200 bg-white",
                            )}
                          >
                            <img src={product.image} alt={product.name} className="h-36 w-full object-cover" />
                            <div className="p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="truncate text-base font-black">{product.name}</h3>
                                  <p className={cn("mt-1 line-clamp-2 text-xs leading-relaxed", dark ? "text-white/58" : "text-slate-600")}>
                                    {product.description}
                                  </p>
                                </div>
                                <span className="shrink-0 text-sm font-black text-[#F5A623]">
                                  {formatCurrency(product.priceCfa)}
                                </span>
                              </div>
                              <div className={cn("mt-3 flex items-center justify-between text-xs", dark ? "text-white/55" : "text-slate-500")}>
                                <span>{product.unit}</span>
                                <span>{product.quantityAvailable} available</span>
                              </div>
                              <div className="mt-4 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className={cn("grid h-9 w-9 place-items-center rounded-xl border", dark ? "border-white/20 hover:bg-white/10" : "border-slate-300 hover:bg-slate-100")}
                                    onClick={() => setOrderQuantity(activeShop, product, quantity - 1)}
                                    aria-label={`Reduce ${product.name}`}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </button>
                                  <span className="min-w-9 text-center text-sm font-black">{quantity}</span>
                                  <button
                                    type="button"
                                    className={cn("grid h-9 w-9 place-items-center rounded-xl border", dark ? "border-white/20 hover:bg-white/10" : "border-slate-300 hover:bg-slate-100")}
                                    onClick={() => setOrderQuantity(activeShop, product, quantity + 1)}
                                    aria-label={`Add ${product.name}`}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>
                                {quantity > 0 ? (
                                  <span className="rounded-full bg-[#F5A623]/16 px-3 py-1 text-xs font-black text-[#F5A623]">
                                    Selected
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  <aside className={cn("border-t p-4 lg:border-l lg:border-t-0", dark ? "border-white/10 bg-[#05070B]/42" : "border-slate-200 bg-slate-50/88")}>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#F5A623]">Your order</div>
                    <div className="mt-3 space-y-2">
                      {activeShopOrderEntries.length ? (
                        activeShopOrderEntries.map((line) => (
                          <div key={line.product.id} className={cn("rounded-xl border px-3 py-2 text-sm", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white")}>
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-bold">{line.product.name}</span>
                              <span className="font-black">x{line.quantity}</span>
                            </div>
                            <div className={cn("mt-1 text-xs", dark ? "text-white/55" : "text-slate-500")}>
                              {formatCurrency(line.product.priceCfa * line.quantity)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={cn("rounded-xl border px-3 py-4 text-sm font-semibold", dark ? "border-white/10 bg-white/[0.04] text-white/58" : "border-slate-200 bg-white text-slate-500")}>
                          Select products to start an order.
                        </div>
                      )}
                    </div>
                    <div className="mt-4 border-t pt-4" style={{ borderColor: dark ? "rgba(255,255,255,.14)" : "rgba(15,23,42,.12)" }}>
                      <div className="flex items-center justify-between text-sm">
                        <span className={dark ? "text-white/62" : "text-slate-600"}>Subtotal</span>
                        <span className="font-black">{formatCurrency(activeShopSubtotal)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={submitShopOrder}
                        className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-[#F5A623] text-sm font-black text-[#07111F] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                        disabled={!activeShopOrderEntries.length}
                      >
                        Place order
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickReply("Can you deliver?")}
                        className={cn("mt-2 h-10 w-full rounded-2xl border text-sm font-black", dark ? "border-white/14 text-white/74 hover:bg-white/8" : "border-slate-200 text-slate-700 hover:bg-white")}
                      >
                        Delivery help
                      </button>
                    </div>
                  </aside>
                </div>
              </div>
            ) : null}
          </section>
        </main>

        <aside className={cn("flex min-h-[520px] flex-col border-t p-4 lg:col-span-1 lg:min-h-0 lg:border-l lg:border-t-0", dark ? "border-white/10 bg-[#07111F]" : "border-slate-200 bg-white")}>
          <div className="mb-4 flex items-center gap-3 border-b border-current/10 pb-4">
            <AgentAvatar agent={shopMode ? visibleConversationAgent : agents.tassi} />
            <div className="min-w-0">
              <div className="font-black">{shopMode ? visibleConversationAgent.name : "Tassi"}</div>
              <div className={cn("text-xs font-semibold", dark ? "text-white/58" : "text-slate-500")}>
                {exchange
                  ? "Export scout and trust guide"
                  : wholesale
                    ? "Wholesale sourcing concierge"
                    : space === "business"
                      ? `${visibleConversationAgent.role} • Business agent`
                      : shopMode
                      ? `${visibleConversationAgent.role} • Shop assistant`
                      : "Concierge"}
              </div>
            </div>
            <span className="ml-auto rounded-full bg-emerald-500/12 px-2 py-1 text-[11px] font-bold text-emerald-600">Online</span>
          </div>
          {exchange ? (
            <div className={cn("mb-3 rounded-2xl border p-3 text-xs leading-relaxed", dark ? "border-[#F5A623]/24 bg-[#F5A623]/10 text-white/78" : "border-[#F5A623]/30 bg-[#F5A623]/10 text-slate-700")}>
              Ready for export is discovery and verification first. Finance actions stay internal-review and compliance-gated.
            </div>
          ) : null}
          {shopMode && activeShop ? (
            <div className={cn("mb-3 rounded-2xl border p-3", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50")}>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#F5A623]">Shop agent</div>
              <div className="mt-2 flex gap-3">
                <img src={activeShop.image} alt="" className="h-14 w-16 rounded-xl object-cover" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{activeShop.name}</div>
                  <div className={cn("truncate text-xs font-semibold", dark ? "text-white/58" : "text-slate-500")}>{activeShop.category}</div>
                  <div className="mt-1 text-xs font-black text-[#F5A623]">{activeShop.distance} • {activeShop.eta}</div>
                </div>
              </div>
              <p className={cn("mt-3 text-sm leading-relaxed", dark ? "text-white/62" : "text-slate-600")}>
                {visibleConversationAgent.name} is here to help you choose products, confirm availability, arrange payment, and coordinate delivery.
              </p>
              <div className="mt-3 border-t pt-3" style={{ borderColor: dark ? "rgba(255,255,255,.16)" : "rgba(15,23,42,.14)" }}>
                <div className={cn("mb-2 flex items-center justify-between text-xs font-black", dark ? "text-white/78" : "text-slate-700")}>
                  <span>Selected items</span>
                  <span>{activeShopOrderEntries.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={cn(dark ? "text-white/62" : "text-slate-600")}>Subtotal</span>
                  <span className="font-black">{formatCurrency(activeShopSubtotal)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className={cn("mb-3 rounded-2xl border p-3", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50")}>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#F5A623]">Current context</div>
              <div className={cn("mt-2 text-sm leading-relaxed", dark ? "text-white/64" : "text-slate-600")}>
                {exchange
                  ? "Tassi is scouting export-ready sellers by trust, story, and verification status."
                  : wholesale
                    ? "Tassi is comparing suppliers, MOQ, lead time, and logistics around Abidjan."
                  : "Tassi is helping you discover nearby shops and services around Cocody."}
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
            {visibleMessages.map((message) => <MessageBubble key={message.id} message={message} dark={dark} activeShop={activeShop} />)}
          </div>
          <div className="mt-4 shrink-0">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {(quoteDraft && wholesale ? ["Approve outreach", "Compare verified", ...quickReplies] : quickReplies).map((reply) => (
                <button key={reply} type="button" onClick={() => handleQuickReply(reply)} className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition hover:-translate-y-0.5", dark ? "border-white/12 bg-white/[0.04] text-white hover:border-[#F5A623]/60" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-[#F5A623]/50")}>
                  {reply}
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleAsk(input);
              }}
              className={cn("flex items-center gap-2 rounded-3xl border-2 p-2", dark ? "border-[#F5A623]/34 bg-[#05070B]" : "border-[#F5A623]/55 bg-white")}
            >
              <button type="button" onClick={() => fileInputRef.current?.click()} className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Attach file">
                <Paperclip className="h-5 w-5" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handlePhoto(event.target.files?.[0])} />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={composerPlaceholder}
                className={cn("min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold outline-none placeholder:text-current/46", dark ? "text-white" : "text-slate-950")}
              />
              <button type="button" onClick={startVoice} className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", voiceState === "listening" ? "bg-red-500 text-white" : dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Tap to speak">
                {voiceState === "listening" ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Photo search">
                <Camera className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setVideoOpen(true)} className={cn("hidden h-11 w-11 shrink-0 place-items-center rounded-full sm:grid", dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Live product preview">
                <Video className="h-5 w-5" />
              </button>
              <button type="submit" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F5A623] text-[#07111F]" aria-label={shopMode || space === "business" ? `Send to ${visibleConversationAgent.name}` : "Send to Tassi"}>
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </aside>
      </div>

      {videoOpen ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className={cn("w-full max-w-2xl overflow-hidden rounded-2xl border", dark ? "border-white/12 bg-[#07111F] text-white" : "border-white bg-white text-slate-950")}>
            <div className="flex items-center justify-between border-b border-current/10 px-4 py-3">
              <div>
                <div className="text-lg font-semibold">Live product preview</div>
                <div className="text-sm text-current/60">This call is live and not recorded.</div>
              </div>
              <button type="button" onClick={() => setVideoOpen(false)} className="rounded-md border border-current/15 px-3 py-2 text-sm font-semibold">Close</button>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_220px]">
              <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-950 text-white">
                <div className="text-center">
                  <Video className="mx-auto h-10 w-10 text-[#F5A623]" />
                  <p className="mt-3 text-sm">The shop can show the product live when the Front Desk accepts.</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-current/10 p-3">
                  <div className="font-semibold">{activeShop?.name || "Nearby shop"}</div>
                  <div className="text-sm text-current/55">{activeShop ? `${activeShop.distance} | ${activeShop.eta}` : "Choose a shop first"}</div>
                </div>
                <button type="button" onClick={() => setVideoOpen(false)} className="w-full rounded-md bg-[#F5A623] px-3 py-2 text-sm font-semibold text-black">{shopMode && activeShop ? `Return to ${activeShop.frontDesk.name}` : "Return to map"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

