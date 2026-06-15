import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ChevronDown,
  Coffee,
  Factory,
  FileText,
  Gift,
  Hammer,
  Leaf,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Mic,
  Minus,
  Moon,
  Navigation,
  Package,
  Paperclip,
  Pill,
  Plus,
  Search,
  Send,
  Shirt,
  ShoppingBag,
  Square,
  Store,
  Sun,
  Truck,
  Utensils,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getSeededBusinessPlaces, type SeededBusinessPlace } from "./seededBusinessData";
import type {
  CommerceAgent,
  CommerceShop,
  ConversationMessage,
  ConversationSpace,
  ExportunityShellMode,
  ShopProduct,
  ThemeMode,
} from "./ExportunityConversationalCommerce";

type NeighbourhoodCommerceProps = {
  onNavigate?: (href: string) => void;
  isAdmin?: boolean;
  initialSpace?: ConversationSpace;
  embeddedShell?: boolean;
  shellMode?: ExportunityShellMode;
};

type OrderLine = {
  product: ShopProduct;
  quantity: number;
};

type PublicPlacesState = {
  provider: "google" | "curated";
  label: string;
  detail: string;
  lastSyncTime?: string;
};

type PublicMapsConfig = {
  provider: "google" | "leaflet";
  enabled?: boolean;
  browserApiKey?: string | null;
  mapRenderer?: "google_maps" | "leaflet_openstreetmap";
  businessDataProvider?: "google_places" | "curated_city_data";
  placesImportEnabled?: boolean;
  mapId?: string | null;
  mapIdLight?: string | null;
  mapIdDark?: string | null;
  google?: {
    enabled?: boolean;
    placesApiKeyPresent?: boolean;
    browserApiKeyPresent?: boolean;
    mapIdPresent?: boolean;
    setupRequired?: boolean;
    mapSetupRequired?: boolean;
    placesSetupRequired?: boolean;
    advancedMapSetupRequired?: boolean;
    requiredEnv?: string[];
  };
  message?: string;
};

function isGoogleMapReady(config: PublicMapsConfig) {
  return (
    config.provider === "google" &&
    config.enabled !== false &&
    !config.google?.mapSetupRequired &&
    Boolean(config.browserApiKey)
  );
}

declare global {
  interface Window {
    google?: any;
    __exportunityGoogleMapsPromise?: Promise<void>;
    gm_authFailure?: () => void;
  }
}

const ABIDJAN_COCODY: [number, number] = [5.35995, -4.00826];

const tassi: CommerceAgent = {
  id: "tassi",
  name: "Tassi",
  role: "Concierge",
  status: "online",
  color: "#F5A623",
  avatarUrl: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=220&q=85",
};

const deliveryAgent: CommerceAgent = {
  id: "delivery-agent",
  name: "Koffi",
  role: "Delivery",
  status: "available",
  color: "#16a34a",
  avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=220&q=85",
};

const walletAgent: CommerceAgent = {
  id: "wallet-agent",
  name: "Accountant",
  role: "Wallet",
  status: "available",
  color: "#2563eb",
  avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=220&q=85",
};

const supplierAgent: CommerceAgent = {
  id: "supplier-agent",
  name: "Kone",
  role: "Sourcing",
  status: "online",
  color: "#0f766e",
  avatarUrl: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&w=220&q=85",
};

const businessAgents: CommerceAgent[] = [
  { id: "front-desk", name: "Front Desk", role: "Customer flow", status: "online", color: "#f97316", avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=220&q=85" },
  { id: "inventory", name: "Inventory", role: "Stock", status: "online", color: "#2563eb" },
  { id: "accountant", name: "Accountant", role: "Finance", status: "online", color: "#16a34a", avatarUrl: walletAgent.avatarUrl },
  { id: "delivery-lead", name: "Delivery Lead", role: "Logistics", status: "online", color: "#7c3aed", avatarUrl: deliveryAgent.avatarUrl },
  { id: "marketing", name: "Marketing", role: "Growth", status: "available", color: "#d97706" },
  { id: "owner", name: "Owner", role: "You", status: "online", color: "#111827" },
];

const cityQuickReplies = ["Find breakfast near me", "Fresh bread", "Coffee nearby", "Building materials", "Need delivery", "Send to family"];
const wholesaleQuickReplies = ["Find suppliers near me", "Request a quote", "Building materials wholesale", "Machinery", "Packaging", "Logistics help"];
const exchangeQuickReplies = ["Ready for export", "Verified sellers", "Food exporters", "Women-led shops", "Seller proof", "Compliance review"];
const shopQuickReplies = ["What should I buy first?", "Can you deliver?", "Use my wallet", "Can I see it live?", "Suggest a bundle"];
const businessQuickReplies = ["What needs attention?", "Low stock", "Today sales", "Assign delivery", "Plan a promo"];

const productLibrary: Record<string, ShopProduct[]> = {
  Bakery: [
    {
      id: "bread-1",
      name: "Pain complet",
      description: "Fresh whole bread baked today.",
      category: "Bread",
      unit: "piece",
      priceCfa: 900,
      quantityAvailable: 80,
      image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "bread-2",
      name: "Croissant",
      description: "Butter croissant ready for breakfast delivery.",
      category: "Breakfast",
      unit: "piece",
      priceCfa: 500,
      quantityAvailable: 120,
      image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "bread-3",
      name: "Breakfast bundle",
      description: "Bread, two pastries, and hot coffee from the shop.",
      category: "Bundle",
      unit: "bundle",
      priceCfa: 3200,
      quantityAvailable: 24,
      image: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=900&q=80",
    },
  ],
  Coffee: [
    {
      id: "coffee-1",
      name: "Cafe filtre",
      description: "House coffee, ground and prepared fresh.",
      category: "Coffee",
      unit: "cup",
      priceCfa: 1200,
      quantityAvailable: 60,
      image: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "coffee-2",
      name: "Coffee beans",
      description: "Roasted beans for home or office.",
      category: "Coffee",
      unit: "500g",
      priceCfa: 3500,
      quantityAvailable: 32,
      image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=900&q=80",
    },
  ],
  "Hardware Store": [
    {
      id: "hardware-1",
      name: "Ciment Portland",
      description: "Cement bags available for pickup or delivery.",
      category: "Construction",
      unit: "25kg",
      priceCfa: 7500,
      quantityAvailable: 320,
      image: "https://images.unsplash.com/photo-1518005020951-eccb494ad4ac?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "hardware-2",
      name: "Roofing sheets",
      description: "Corrugated sheets for small and medium projects.",
      category: "Roofing",
      unit: "sheet",
      priceCfa: 4500,
      quantityAvailable: 120,
      image: "https://images.unsplash.com/photo-1578574577315-1fffe8f6c6f5?auto=format&fit=crop&w=900&q=80",
    },
  ],
  "Building Materials": [
    {
      id: "bulk-1",
      name: "Cement quote",
      description: "Bulk bags with supplier confirmation before outreach.",
      category: "Materials",
      unit: "bag",
      priceCfa: 6900,
      quantityAvailable: 800,
      image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "bulk-2",
      name: "Sand 0/4",
      description: "Construction sand available by truckload.",
      category: "Materials",
      unit: "m3",
      priceCfa: 13000,
      quantityAvailable: 90,
      image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80",
    },
  ],
  Organic: [
    {
      id: "organic-1",
      name: "Local vegetable basket",
      description: "Fresh produce from nearby growers.",
      category: "Groceries",
      unit: "basket",
      priceCfa: 6500,
      quantityAvailable: 18,
      image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
    },
  ],
};

function cleanText(value: string) {
  return value
    .replaceAll("Ã©", "e")
    .replaceAll("Ã¨", "e")
    .replaceAll("Ã´", "o")
    .replaceAll("Ã¢", "a")
    .replaceAll("Ãª", "e")
    .replaceAll("Ã", "A");
}

function kmBetween(from: [number, number], to: [number, number]) {
  const radius = 6371;
  const dLat = ((to[0] - from[0]) * Math.PI) / 180;
  const dLon = ((to[1] - from[1]) * Math.PI) / 180;
  const lat1 = (from[0] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceEta(position: [number, number]) {
  const km = kmBetween(ABIDJAN_COCODY, position);
  return {
    distance: `${Math.max(0.4, km).toFixed(1)} km`,
    eta: `${Math.max(3, Math.round(km * 4.2))} min`,
  };
}

function validPosition(position: [number, number] | undefined | null): position is [number, number] {
  return Array.isArray(position) && Number.isFinite(position[0]) && Number.isFinite(position[1]);
}

function toneForCategory(category: string) {
  const value = category.toLowerCase();
  if (value.includes("coffee") || value.includes("cafe")) return "#7c3f1d";
  if (value.includes("building") || value.includes("hardware") || value.includes("construction")) return "#2563eb";
  if (value.includes("gift")) return "#9333ea";
  if (value.includes("pharmacy")) return "#16a34a";
  if (value.includes("organic") || value.includes("food") || value.includes("grocery")) return "#65a30d";
  if (value.includes("machinery") || value.includes("industrial")) return "#475569";
  if (value.includes("packaging")) return "#0f766e";
  return "#F5A623";
}

type CategoryVisualKind =
  | "bakery"
  | "coffee"
  | "food"
  | "organic"
  | "pharmacy"
  | "fashion"
  | "gift"
  | "materials"
  | "industry"
  | "logistics"
  | "packaging"
  | "pme"
  | "supplier"
  | "shop";

function visualForCategory(category: string, wholesale: boolean, exchange: boolean): { label: string; marker: string; Icon: LucideIcon; kind: CategoryVisualKind } {
  const value = category.toLowerCase();
  if (exchange) return { label: "Export", marker: "Export", Icon: BriefcaseBusiness, kind: "pme" };
  if (value.includes("bakery") || value.includes("bread")) return { label: "Bakery", marker: "Bakery", Icon: Store, kind: "bakery" };
  if (value.includes("coffee") || value.includes("cafe")) return { label: "Coffee", marker: "Coffee", Icon: Coffee, kind: "coffee" };
  if (value.includes("restaurant")) return { label: "Food", marker: "Food", Icon: Utensils, kind: "food" };
  if (value.includes("organic") || value.includes("grocery") || value.includes("food")) return { label: "Groceries", marker: "Groceries", Icon: Leaf, kind: "organic" };
  if (value.includes("pharmacy")) return { label: "Pharmacy", marker: "Pharmacy", Icon: Pill, kind: "pharmacy" };
  if (value.includes("fashion") || value.includes("textile")) return { label: "Fashion", marker: "Fashion", Icon: Shirt, kind: "fashion" };
  if (value.includes("gift")) return { label: "Gifts", marker: "Gifts", Icon: Gift, kind: "gift" };
  if (value.includes("hardware") || value.includes("building") || value.includes("construction")) return { label: "Materials", marker: "Materials", Icon: Hammer, kind: "materials" };
  if (value.includes("machinery") || value.includes("industrial")) return { label: "Industry", marker: "Industry", Icon: Factory, kind: "industry" };
  if (value.includes("logistics") || value.includes("warehouse")) return { label: "Logistics", marker: "Logistics", Icon: Truck, kind: "logistics" };
  if (value.includes("packaging")) return { label: "Packaging", marker: "Packaging", Icon: Package, kind: "packaging" };
  return wholesale ? { label: "Supplier", marker: "Supplier", Icon: Warehouse, kind: "supplier" } : { label: "Shop", marker: "Shop", Icon: Store, kind: "shop" };
}

function markerSvgForCategory(kind: CategoryVisualKind) {
  const paths: Record<CategoryVisualKind, string> = {
    bakery: '<path d="M6 15c0-3.3 2.7-6 6-6s6 2.7 6 6v3H6v-3Z"/><path d="M9 11.5v5"/><path d="M12 9.5v7"/><path d="M15 11.5v5"/>',
    coffee: '<path d="M6 9h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V9Z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 5v2"/><path d="M12 5v2"/>',
    food: '<path d="M7 5v14"/><path d="M5 5v5a2 2 0 0 0 4 0V5"/><path d="M15 5v14"/><path d="M15 5c2 1 3 3 3 6v1h-3"/>',
    organic: '<path d="M6 14c6-8 11-8 13-7-1 8-6 11-13 10"/><path d="M6 17c2-4 5-6 9-8"/>',
    pharmacy: '<path d="M12 5v14"/><path d="M5 12h14"/><rect x="5" y="5" width="14" height="14" rx="4"/>',
    fashion: '<path d="M8 7 6 9l2 3v7h8v-7l2-3-2-2-2 2h-4L8 7Z"/><path d="M10 7a2 2 0 0 0 4 0"/>',
    gift: '<rect x="5" y="9" width="14" height="10" rx="2"/><path d="M12 9v10"/><path d="M5 13h14"/><path d="M9 9c-2 0-3-1-3-2s1-2 2-2c2 0 3 4 4 4"/><path d="M15 9c2 0 3-1 3-2s-1-2-2-2c-2 0-3 4-4 4"/>',
    materials: '<path d="m14 6 4 4-8 8H6v-4l8-8Z"/><path d="m13 7 4 4"/><path d="M5 20h14"/>',
    industry: '<path d="M4 19V9l5 3V9l5 3V7h6v12H4Z"/><path d="M7 16h2"/><path d="M12 16h2"/><path d="M17 16h1"/>',
    logistics: '<path d="M4 8h10v8H4z"/><path d="M14 11h3l3 3v2h-6z"/><path d="M7 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M17 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>',
    packaging: '<path d="M5 8 12 4l7 4v8l-7 4-7-4V8Z"/><path d="m5 8 7 4 7-4"/><path d="M12 12v8"/>',
    pme: '<path d="M5 20V6h14v14"/><path d="M8 9h2"/><path d="M14 9h2"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M10 20v-4h4v4"/>',
    supplier: '<path d="M4 20V9l8-5 8 5v11"/><path d="M8 20v-7h8v7"/><path d="M10 16h4"/>',
    shop: '<path d="M5 10h14l-1-5H6l-1 5Z"/><path d="M6 10v10h12V10"/><path d="M9 20v-5h6v5"/><path d="M7 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/>',
  };
  return `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</svg>`;
}

function frontDeskFor(place: SeededBusinessPlace, index: number): CommerceAgent {
  const names = place.type === "wholesale" ? ["Kone", "Amina", "Dao", "Moussa"] : ["Awa", "Marie", "Iya", "Mariam", "Noah"];
  return {
    id: `${place.type === "wholesale" ? "supplier" : "frontdesk"}-${place.id}`,
    name: names[index % names.length],
    role: place.type === "wholesale" ? "Supplier Desk" : "Front Desk",
    status: "online",
    color: toneForCategory(place.category),
    avatarUrl: place.type === "wholesale" ? supplierAgent.avatarUrl : "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=220&q=85",
  };
}

function seededToShop(place: SeededBusinessPlace, index: number): CommerceShop {
  const position: [number, number] = [place.lat, place.lng];
  const meta = distanceEta(position);
  return {
    id: place.id,
    name: cleanText(place.name),
    category: cleanText(place.category),
    image: place.imageUrl,
    distance: meta.distance,
    eta: meta.eta,
    position,
    frontDesk: frontDeskFor(place, index),
    openLabel: cleanText(place.openStatus),
    rating: place.rating,
    ratingCount: place.reviewCount,
    moq: place.moq,
    leadTime: place.leadTime,
    trustStatus: cleanText(place.verificationStatus),
    availableQuantity: place.availableQuantity,
    contactStatus: place.contactStatus,
    city: cleanText(place.city),
    district: cleanText(place.district),
    source: place.source || "seeded",
  };
}

function productKey(shop: CommerceShop) {
  const category = shop.category.toLowerCase();
  if (category.includes("bakery") || category.includes("bread")) return "Bakery";
  if (category.includes("cafe") || category.includes("coffee")) return "Coffee";
  if (category.includes("hardware")) return "Hardware Store";
  if (category.includes("building") || category.includes("construction")) return "Building Materials";
  if (category.includes("organic") || category.includes("grocery") || category.includes("food")) return "Organic";
  return shop.category;
}

function productsForShop(shop: CommerceShop): ShopProduct[] {
  const products = productLibrary[productKey(shop)];
  if (products?.length) return products;
  return [
    {
      id: `${shop.id}-featured`,
      name: `${shop.name} featured item`,
      description: "Available now. Confirm exact stock with the shop agent.",
      category: "Featured",
      unit: "unit",
      priceCfa: 2500,
      quantityAvailable: 20,
      image: shop.image,
    },
    {
      id: `${shop.id}-bundle`,
      name: `${shop.name} customer favorite`,
      description: "Popular option for pickup or quick local delivery.",
      category: "Popular",
      unit: "unit",
      priceCfa: 3200,
      quantityAvailable: 12,
      image: shop.image,
    },
  ];
}

function numericSeed(value: string) {
  return value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function merchantIdentity(shop: CommerceShop) {
  const names = ["Awa", "Mariam", "Koffi", "Iya", "Serge", "Aminata", "Noah", "Fatou"];
  const seed = numericSeed(shop.id || shop.name);
  const ownerName = names[seed % names.length];
  const years = 2 + (seed % 11);
  const district = shop.district || "Cocody";
  const story =
    shop.merchantStory ||
    `${ownerName} runs ${shop.name} in ${district}. Customers come for ${shop.category.toLowerCase()} products, quick answers, and reliable local delivery.`;
  return {
    ownerName,
    years,
    story,
    portraitUrl: shop.frontDesk.avatarUrl || tassi.avatarUrl,
    proof: [
      `${years} years in ${district}`,
      `${shop.rating.toFixed(1)} rating from ${shop.ratingCount} signals`,
      shop.trustStatus || "Neighbourhood trust building",
    ],
  };
}

function formatMoney(value: number) {
  return `${Intl.NumberFormat("en-US").format(Math.round(value))} XAF`;
}

function makePinIcon(shop: CommerceShop, active: boolean, dark: boolean, wholesale: boolean, exchange: boolean) {
  const tone = toneForCategory(shop.category);
  const visual = visualForCategory(shop.category, wholesale, exchange);
  return L.divIcon({
    className: "exportunity-neighbourhood-marker",
    iconSize: active ? [74, 74] : [54, 54],
    iconAnchor: active ? [37, 62] : [27, 44],
    popupAnchor: [0, -44],
    html: `
      <button type="button" aria-label="${shop.name}" style="position:relative;display:grid;place-items:center;width:${active ? 64 : 48}px;height:${active ? 64 : 48}px;border-radius:22px;border:2px solid ${active ? "#F5A623" : "rgba(255,255,255,.95)"};background:${tone};color:white;box-shadow:0 0 0 ${active ? 10 : 5}px rgba(245,166,35,.16),0 18px 34px rgba(0,0,0,.24);font-family:Inter,system-ui,sans-serif;font-size:${active ? 26 : 21}px;font-weight:950;">
        ${markerSvgForCategory(visual.kind)}
        <span style="position:absolute;left:50%;bottom:-10px;transform:translateX(-50%) rotate(45deg);width:18px;height:18px;border-right:2px solid rgba(255,255,255,.95);border-bottom:2px solid rgba(255,255,255,.95);background:${tone};"></span>
      </button>
    `,
  });
}

function makeUserIcon() {
  return L.divIcon({
    className: "exportunity-neighbourhood-user",
    iconSize: [132, 78],
    iconAnchor: [66, 64],
    html: `
      <div style="display:grid;justify-items:center;font-family:Inter,system-ui,sans-serif;">
        <div style="border-radius:999px;background:#111827;color:white;padding:8px 13px;font-weight:850;font-size:12px;box-shadow:0 12px 28px rgba(15,23,42,.32);">You are here</div>
        <div style="margin-top:8px;width:26px;height:26px;border-radius:999px;border:4px solid white;background:#2563eb;box-shadow:0 0 0 14px rgba(37,99,235,.18),0 0 30px rgba(37,99,235,.72);"></div>
      </div>
    `,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadGoogleMapsScript(apiKey: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps requires a browser"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__exportunityGoogleMapsPromise) return window.__exportunityGoogleMapsPromise;

  window.__exportunityGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const rejectAuth = () => {
      window.__exportunityGoogleMapsPromise = undefined;
      window.dispatchEvent(new CustomEvent("exportunity:google-maps-auth-failure"));
      reject(new Error("Google Maps rejected the browser API key"));
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-exportunity-google-maps='true']");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load")), { once: true });
      window.gm_authFailure = rejectAuth;
      return;
    }

    window.gm_authFailure = rejectAuth;
    const script = document.createElement("script");
    script.dataset.exportunityGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=marker`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });

  return window.__exportunityGoogleMapsPromise;
}

function makeGoogleMarkerElement(shop: CommerceShop, active: boolean, wholesale: boolean, exchange: boolean) {
  const element = document.createElement("button");
  const tone = toneForCategory(shop.category);
  const visual = visualForCategory(shop.category, wholesale, exchange);
  element.type = "button";
  element.setAttribute("aria-label", shop.name);
  element.style.cssText = [
    "position:relative",
    "display:grid",
    "place-items:center",
    `width:${active ? 62 : 48}px`,
    `height:${active ? 62 : 48}px`,
    "border-radius:22px",
    `border:2px solid ${active ? "#F5A623" : "rgba(255,255,255,.96)"}`,
    `background:${tone}`,
    "color:white",
    `box-shadow:0 0 0 ${active ? 10 : 5}px rgba(245,166,35,.16),0 18px 34px rgba(0,0,0,.24)`,
    "font-family:Inter,system-ui,sans-serif",
    `font-size:${active ? 25 : 20}px`,
    "font-weight:950",
    "cursor:pointer",
  ].join(";");
  element.innerHTML = `${markerSvgForCategory(visual.kind)}<span style="position:absolute;left:50%;bottom:-10px;transform:translateX(-50%) rotate(45deg);width:18px;height:18px;border-right:2px solid rgba(255,255,255,.95);border-bottom:2px solid rgba(255,255,255,.95);background:${tone};"></span>`;
  return element;
}

function googleMarkerSvgUrl(shop: CommerceShop, active: boolean, wholesale: boolean, exchange: boolean) {
  const tone = toneForCategory(shop.category);
  const visual = visualForCategory(shop.category, wholesale, exchange);
  const icon = markerSvgForCategory(visual.kind).replace(
    'viewBox="0 0 24 24" width="26" height="26"',
    'x="19" y="14" viewBox="0 0 24 24" width="26" height="26" color="#FFFFFF"',
  );
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="82" viewBox="0 0 72 82">
      <defs>
        <filter id="shadow" x="-40%" y="-30%" width="180%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="6" flood-color="#111827" flood-opacity=".28"/>
        </filter>
      </defs>
      <path d="M36 77 23 55h26L36 77Z" fill="${tone}" stroke="rgba(255,255,255,.96)" stroke-width="2.4" filter="url(#shadow)"/>
      <rect x="10" y="5" width="52" height="52" rx="20" fill="${tone}" stroke="${active ? "#F5A623" : "rgba(255,255,255,.96)"}" stroke-width="${active ? 4 : 2.4}" filter="url(#shadow)"/>
      <circle cx="52" cy="14" r="7" fill="#F5A623" opacity="${active ? ".95" : ".78"}"/>
      ${icon}
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function GoogleMapsPane({
  dark,
  places,
  activeShop,
  userLocation,
  wholesale,
  exchange,
  onSelect,
  onUnavailable,
  mapsConfig,
}: {
  dark: boolean;
  places: CommerceShop[];
  activeShop: CommerceShop | null;
  userLocation: [number, number];
  wholesale: boolean;
  exchange: boolean;
  onSelect: (shop: CommerceShop) => void;
  onUnavailable?: (reason?: string) => void;
  mapsConfig: PublicMapsConfig;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const apiKey = mapsConfig.browserApiKey || "";
  const mapId = (dark ? mapsConfig.mapIdDark || mapsConfig.mapId : mapsConfig.mapIdLight || mapsConfig.mapId) || undefined;
  const safeUserLocation = validPosition(userLocation) ? userLocation : ABIDJAN_COCODY;
  const safePlaces = places.filter((shop) => validPosition(shop.position));
  const safeActiveShop = activeShop && validPosition(activeShop.position) ? activeShop : null;

  useEffect(() => {
    const handleAuthFailure = () => {
      const reason = "Google Maps key rejected. OpenStreetMap is active.";
      setReady(false);
      setLoadError(reason);
      onUnavailable?.(reason);
    };
    window.addEventListener("exportunity:google-maps-auth-failure", handleAuthFailure);
    return () => window.removeEventListener("exportunity:google-maps-auth-failure", handleAuthFailure);
  }, [onUnavailable]);

  useEffect(() => {
    let cancelled = false;
    if (!apiKey) {
      setLoadError("Google Maps needs a browser-restricted key. OpenStreetMap is available as fallback.");
      return;
    }
    void loadGoogleMapsScript(apiKey)
      .then(() => {
        if (!cancelled) {
          setReady(true);
          setLoadError(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          const reason = error.message || "Google Maps could not load.";
          setReady(false);
          setLoadError(reason);
          onUnavailable?.(reason);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const timer = window.setTimeout(() => {
      const text = containerRef.current?.innerText || "";
      if (/didn't load Google Maps correctly|Oops! Something went wrong/i.test(text)) {
        const reason = "Google Maps key rejected. OpenStreetMap is active.";
        setReady(false);
        setLoadError(reason);
        onUnavailable?.(reason);
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [onUnavailable, ready]);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.google?.maps) return;
    const center = { lat: safeUserLocation[0], lng: safeUserLocation[1] };
    const mapOptions: Record<string, unknown> = {
      center,
      zoom: 13,
      clickableIcons: true,
      fullscreenControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      gestureHandling: "greedy",
    };
    if (mapId) {
      mapOptions.mapId = mapId;
    } else {
      mapOptions.styles = dark
        ? [
            { elementType: "geometry", stylers: [{ color: "#0A1628" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#CBD5E1" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#1E293B" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#020617" }] },
            { featureType: "poi.business", stylers: [{ visibility: "on" }] },
          ]
        : [
            { elementType: "geometry", stylers: [{ color: "#F7F8FA" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#D8EEF8" }] },
            { featureType: "poi.business", stylers: [{ visibility: "on" }] },
          ];
    }
    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(containerRef.current, mapOptions);
      infoWindowRef.current = new window.google.maps.InfoWindow();
    } else {
      mapRef.current.setOptions(mapOptions);
    }
    window.setTimeout(() => {
      if (!mapRef.current || !window.google?.maps) return;
      window.google.maps.event.trigger(mapRef.current, "resize");
      mapRef.current.setCenter(center);
    }, 80);
  }, [dark, mapId, ready, safeUserLocation]);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;
    markerRefs.current.forEach((marker) => {
      if (marker?.setMap) marker.setMap(null);
      if ("map" in marker) marker.map = null;
    });
    markerRefs.current = [];
    if (routeRef.current?.setMap) routeRef.current.setMap(null);

    const activePosition = safeActiveShop?.position || safePlaces[0]?.position || safeUserLocation;
    const routePoints = [
      { lat: safeUserLocation[0], lng: safeUserLocation[1] },
      { lat: activePosition[0], lng: activePosition[1] },
    ];
    routeRef.current = new window.google.maps.Polyline({
      map,
      path: routePoints,
      strokeColor: "#F5A623",
      strokeOpacity: 0.88,
      strokeWeight: 4,
      geodesic: true,
    });

    const userMarker = new window.google.maps.Marker({
      map,
      position: routePoints[0],
      title: "You are here",
      label: { text: "You", color: "#ffffff", fontWeight: "900" },
    });
    markerRefs.current.push(userMarker);

    const canUseAdvancedMarkers = Boolean(mapId && window.google.maps.marker?.AdvancedMarkerElement);
    safePlaces.forEach((shop) => {
      const active = safeActiveShop?.id === shop.id;
      const position = { lat: shop.position[0], lng: shop.position[1] };
      const marker = canUseAdvancedMarkers
        ? new window.google.maps.marker.AdvancedMarkerElement({
            map,
            position,
            title: shop.name,
            content: makeGoogleMarkerElement(shop, active, wholesale, exchange),
          })
        : new window.google.maps.Marker({
            map,
            position,
            title: shop.name,
            icon: {
              url: googleMarkerSvgUrl(shop, active, wholesale, exchange),
              scaledSize: new window.google.maps.Size(active ? 72 : 58, active ? 82 : 66),
              anchor: new window.google.maps.Point(active ? 36 : 29, active ? 77 : 62),
            },
          });
      marker.addListener("click", () => {
        onSelect(shop);
        infoWindowRef.current?.setContent(`
          <div style="width:220px;font-family:Inter,system-ui,sans-serif;">
            <img src="${escapeHtml(shop.image)}" alt="" style="width:100%;height:92px;object-fit:cover;border-radius:12px;margin-bottom:8px;" />
            <div style="font-weight:900;color:#0f172a;">${escapeHtml(shop.name)}</div>
            <div style="font-size:13px;color:#64748b;">${escapeHtml(shop.category)}</div>
            <div style="margin-top:5px;font-size:13px;font-weight:800;color:#111827;">${escapeHtml(shop.distance)} - ${escapeHtml(shop.eta)}</div>
          </div>
        `);
        infoWindowRef.current?.open({ map, anchor: marker });
      });
      markerRefs.current.push(marker);
    });

    if (safeActiveShop) {
      map.panTo({ lat: safeActiveShop.position[0], lng: safeActiveShop.position[1] });
      map.setZoom(15);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend(routePoints[0]);
    safePlaces.slice(0, 12).forEach((shop) => bounds.extend({ lat: shop.position[0], lng: shop.position[1] }));
    if (!bounds.isEmpty()) map.fitBounds(bounds, 72);
  }, [exchange, mapId, onSelect, ready, safeActiveShop, safePlaces, safeUserLocation, wholesale]);

  return (
    <div className="absolute inset-0 h-full min-h-[320px] w-full">
      <div ref={containerRef} className="absolute inset-0 h-full min-h-[320px] w-full" style={{ minHeight: 320 }} />
      {loadError ? (
        <div className={cn("absolute bottom-4 left-4 max-w-[280px] rounded-2xl border px-3 py-2 text-xs font-semibold shadow-lg", dark ? "border-white/12 bg-[#07111F]/90 text-white/76" : "border-slate-200 bg-white/92 text-slate-700")}>
          {loadError}
        </div>
      ) : null}
    </div>
  );
}

function MapFocus({ userLocation, activeShop, visiblePlaces }: { userLocation: [number, number]; activeShop: CommerceShop | null; visiblePlaces: CommerceShop[] }) {
  const map = useMap();
  useEffect(() => {
    const safeUserLocation = validPosition(userLocation) ? userLocation : ABIDJAN_COCODY;
    const safeVisiblePlaces = visiblePlaces.filter((shop) => validPosition(shop.position));
    try {
      const size = map.getSize();
      if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || size.x <= 0 || size.y <= 0) return;
      if (activeShop && validPosition(activeShop.position)) {
        map.flyTo(activeShop.position, 15, { duration: 0.85, easeLinearity: 0.18 });
        return;
      }
      const bounds = L.latLngBounds([safeUserLocation, ...safeVisiblePlaces.map((shop) => shop.position)]);
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [42, 42], maxZoom: 13, duration: 0.85, easeLinearity: 0.18 });
        return;
      }
      map.setView(safeUserLocation, 13, { animate: false });
    } catch {
      map.setView(safeUserLocation, 13, { animate: false });
    }
  }, [activeShop, map, userLocation, visiblePlaces]);
  return null;
}

function AgentAvatar({ agent, size = "md" }: { agent: CommerceAgent; size?: "sm" | "md" | "lg" }) {
  const dimension = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-white text-xs font-black", dimension)} style={{ borderColor: agent.color, color: agent.color }}>
      {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : agent.name.slice(0, 2)}
      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" />
    </span>
  );
}

function MessageBubble({ message, dark, agent }: { message: ConversationMessage; dark: boolean; agent?: CommerceAgent }) {
  const isUser = message.agentId === "user";
  return (
    <div className={cn("flex items-start gap-3", isUser && "justify-end")}>
      {!isUser && agent ? <AgentAvatar agent={agent} size="sm" /> : null}
      <div
        className={cn(
          "max-w-[88%] rounded-2xl border px-3.5 py-3 text-sm leading-relaxed shadow-[0_14px_34px_rgba(15,23,42,.13)]",
          isUser
            ? "border-[#F5A623]/60 bg-[#F5A623] text-[#07111F]"
            : dark
              ? "border-white/12 bg-white/[0.06] text-white"
              : "border-slate-200 bg-white text-slate-900",
        )}
      >
        {!isUser && agent ? (
          <div className={cn("mb-1 flex items-center gap-2 text-[11px] font-black", dark ? "text-white/62" : "text-slate-500")}>
            <span className="text-[#F5A623]">{agent.name}</span>
            <span>{agent.role}</span>
          </div>
        ) : null}
        {message.imageUrl ? <img src={message.imageUrl} alt="Attached product" className="mb-3 max-h-36 rounded-xl object-cover" /> : null}
        {message.content}
      </div>
    </div>
  );
}

function categoryHint(label: string, wholesale: boolean, exchange: boolean) {
  const value = label.toLowerCase();
  if (exchange) {
    if (value.includes("export")) return "Export-ready profiles";
    if (value.includes("revenue")) return "Sales signals";
    if (value.includes("compliance")) return "Internal review";
    return "Verified business stories";
  }
  if (wholesale) {
    if (value.includes("quote")) return "Collect quantity and route";
    if (value.includes("machinery")) return "Equipment and parts";
    if (value.includes("logistics")) return "Routes and delivery";
    return "MOQ, lead time, trust";
  }
  if (value.includes("breakfast")) return "Food open now";
  if (value.includes("bread")) return "Bakeries nearby";
  if (value.includes("coffee")) return "Cafe options";
  if (value.includes("organic")) return "Fresh local stock";
  if (value.includes("pharmacy")) return "Health shops";
  if (value.includes("material")) return "Hardware nearby";
  return "Nearby options";
}

function CategoryTile({
  label,
  Icon,
  kind,
  hint,
  dark,
  onClick,
}: {
  label: string;
  Icon: LucideIcon;
  kind: CategoryVisualKind;
  hint: string;
  dark: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group grid min-w-[132px] grid-cols-[40px_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-[18px] border px-2 py-2 text-left transition hover:-translate-y-0.5 md:min-w-[152px] md:grid-cols-[50px_minmax(0,1fr)] md:rounded-[22px] md:px-3 md:py-2.5",
        dark ? "border-white/10 bg-[linear-gradient(135deg,rgba(245,166,35,.16),rgba(255,255,255,.045))] text-white hover:border-[#F5A623]/60" : "border-slate-200 bg-[linear-gradient(135deg,#fff7e8,#ffffff_52%,#f8fafc)] text-slate-900 hover:border-[#F5A623]/65 hover:shadow-[0_18px_38px_rgba(15,23,42,.11)]",
      )}
    >
      <span className="relative grid h-10 w-10 place-items-center rounded-[16px] bg-[#F5A623] text-[#07111F] shadow-[0_14px_30px_rgba(245,166,35,.22)] transition group-hover:scale-[1.04] md:h-[50px] md:w-[50px] md:rounded-[20px]">
        <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/22 text-[#07111F] md:h-9 md:w-9 md:rounded-2xl" dangerouslySetInnerHTML={{ __html: markerSvgForCategory(kind) }} />
        <span className={cn("absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full border shadow-sm md:h-7 md:w-7", dark ? "border-[#07111F] bg-[#07111F] text-[#F5A623]" : "border-white bg-white text-[#F5A623]")}>
          <Icon className="h-3 w-3 md:h-3.5 md:w-3.5" />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-black leading-tight md:text-xs">{label}</span>
        <span className={cn("mt-0.5 block truncate text-[10px] font-bold md:text-[11px]", dark ? "text-white/52" : "text-slate-500")}>{hint}</span>
      </span>
    </button>
  );
}

function LiveMapPane({
  dark,
  places,
  activeShop,
  userLocation,
  wholesale,
  exchange,
  onSelect,
  className,
  provider,
  mapsConfig,
}: {
  dark: boolean;
  places: CommerceShop[];
  activeShop: CommerceShop | null;
  userLocation: [number, number];
  wholesale: boolean;
  exchange: boolean;
  onSelect: (shop: CommerceShop) => void;
  className?: string;
  provider: PublicPlacesState;
  mapsConfig: PublicMapsConfig;
}) {
  const safeUserLocation = validPosition(userLocation) ? userLocation : ABIDJAN_COCODY;
  const safePlaces = places.filter((shop) => validPosition(shop.position));
  const safeActiveShop = activeShop && validPosition(activeShop.position) ? activeShop : null;
  const routePoints = safeActiveShop ? [safeUserLocation, safeActiveShop.position] : [safeUserLocation, safePlaces[0]?.position || safeUserLocation];
  const [googleRenderFailed, setGoogleRenderFailed] = useState(false);
  const [googleRenderFailureReason, setGoogleRenderFailureReason] = useState<string | null>(null);
  useEffect(() => {
    setGoogleRenderFailed(false);
    setGoogleRenderFailureReason(null);
  }, [mapsConfig.browserApiKey, mapsConfig.provider]);
  const googleReady = isGoogleMapReady(mapsConfig) && !googleRenderFailed;
  const rendererLabel = googleReady ? "Google Maps renderer" : googleRenderFailed ? "Google key rejected" : "OpenStreetMap renderer";
  const rendererDetail = googleRenderFailureReason || provider.label;
  return (
    <section className={cn("relative overflow-hidden rounded-none border-l", dark ? "border-white/10 bg-[#07111F]" : "border-slate-200 bg-white", className)}>
      {googleReady ? (
        <GoogleMapsPane
          dark={dark}
          places={safePlaces}
          activeShop={safeActiveShop}
          userLocation={safeUserLocation}
          wholesale={wholesale}
          exchange={exchange}
          onSelect={onSelect}
          onUnavailable={(reason) => {
            setGoogleRenderFailed(true);
            setGoogleRenderFailureReason(reason || "Google Maps could not render. OpenStreetMap is active.");
          }}
          mapsConfig={mapsConfig}
        />
      ) : (
        <MapContainer center={safeUserLocation} zoom={13} className="h-full min-h-[320px] w-full" zoomControl={false}>
          <TileLayer
            key={dark ? "dark" : "light"}
            attribution="&copy; OpenStreetMap &copy; CARTO"
            url={dark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
          />
          <MapFocus userLocation={safeUserLocation} activeShop={safeActiveShop} visiblePlaces={safePlaces} />
          <Polyline positions={routePoints} pathOptions={{ color: "#F5A623", weight: 7, opacity: 0.18 }} />
          <Polyline positions={routePoints} pathOptions={{ color: "#F5A623", weight: 3, opacity: 0.85, dashArray: "14 14" }} />
          <Marker position={safeUserLocation} icon={makeUserIcon()} />
          {safePlaces.map((shop) => {
            const active = safeActiveShop?.id === shop.id;
            return (
              <Marker key={`${shop.id}-${active}-${dark}`} position={shop.position} icon={makePinIcon(shop, active, dark, wholesale, exchange)} eventHandlers={{ click: () => onSelect(shop) }}>
                <Popup>
                  <div className="w-[220px]">
                    <img src={shop.image} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />
                    <div className="font-black">{shop.name}</div>
                    <div className="text-sm text-slate-500">{shop.category}</div>
                    <div className="mt-1 text-sm font-semibold">{shop.distance} - {shop.eta}</div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,transparent_0,transparent_42%,rgba(245,166,35,.06)_70%,rgba(7,17,31,.16)_100%)]" />
      <div className={cn("absolute left-4 right-4 top-4 z-[401] rounded-2xl border p-3 backdrop-blur-xl", dark ? "border-white/12 bg-[#07111F]/78 text-white" : "border-white/90 bg-white/88 text-slate-950 shadow-[0_16px_36px_rgba(15,23,42,.12)]")}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#F5A623]">{exchange ? "Ready for export" : wholesale ? "Wholesale map" : "Neighbourhood map"}</div>
            <div className="mt-1 text-sm font-black">{places.length} live locations around Cocody</div>
          </div>
          <Navigation className="h-5 w-5 text-[#F5A623]" />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <div className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]", googleReady ? "bg-emerald-500/14 text-emerald-600" : googleRenderFailed ? "bg-red-500/12 text-red-600" : "bg-[#F5A623]/16 text-[#9a5f00]")}>
            {rendererLabel}
          </div>
          <div className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]", provider.provider === "google" ? "bg-emerald-500/14 text-emerald-600" : "bg-slate-500/12 text-slate-600")}>
            {provider.provider === "google" ? "Google Places data" : "Curated business data"}
          </div>
        </div>
        <div className={cn("mt-2 text-xs font-semibold", googleRenderFailed ? "text-red-600" : dark ? "text-white/60" : "text-slate-600")}>{rendererDetail}</div>
        <div className={cn("mt-1 line-clamp-2 text-[11px] leading-snug", dark ? "text-white/45" : "text-slate-500")}>{provider.detail}</div>
      </div>
    </section>
  );
}

export function ExportunityNeighbourhoodCommerce({
  onNavigate,
  isAdmin = false,
  initialSpace = "city",
  embeddedShell = false,
  shellMode = "commerce",
}: NeighbourhoodCommerceProps) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return (window.localStorage.getItem("exportunity-map-theme") as ThemeMode | null) || "light";
  });
  const [space, setSpace] = useState<ConversationSpace>(initialSpace);
  const [activeShop, setActiveShop] = useState<CommerceShop | null>(null);
  const [activeProductDetail, setActiveProductDetail] = useState<ShopProduct | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number]>(ABIDJAN_COCODY);
  const [input, setInput] = useState("");
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "unavailable">("idle");
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([
    { id: "hello", agentId: "tassi", content: "Hello, I'm Tassi. What are you looking for around you today?", createdAt: "now", agentSnapshot: tassi },
    { id: "options", agentId: "tassi", content: "You can start with breakfast, fresh bread, coffee, building materials, delivery, or wholesale suppliers.", createdAt: "now", agentSnapshot: tassi },
  ]);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, Record<string, OrderLine>>>({});
  const [placesStatus, setPlacesStatus] = useState<PublicPlacesState>({
    provider: "curated",
    label: "OpenStreetMap active",
    detail: "Curated Abidjan and Cotonou businesses are live. Google Maps/Places will appear here after production keys are configured.",
  });
  const [mapsConfig, setMapsConfig] = useState<PublicMapsConfig>({
    provider: "leaflet",
    enabled: false,
    browserApiKey: null,
    mapRenderer: "leaflet_openstreetmap",
    businessDataProvider: "curated_city_data",
    placesImportEnabled: false,
    message: "OpenStreetMap is active. Google Maps will appear after browser-restricted Google Maps and Places keys are configured.",
  });
  const [videoOpen, setVideoOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const dark = themeMode === "dark";
  const wholesale = space === "wholesale";
  const exchange = space === "exchange";
  const business = space === "business";
  const shopMode = space === "shop" && !!activeShop;
  const mapDominant = shellMode === "mapDominant";

  const retailShops = useMemo(() => getSeededBusinessPlaces({ city: "Abidjan", type: "marketplace" }).map(seededToShop), []);
  const wholesaleShops = useMemo(() => getSeededBusinessPlaces({ city: "Abidjan", type: "wholesale" }).map(seededToShop), []);
  const exchangeShops = useMemo(
    () => [
      ...retailShops.slice(0, 12).map((shop, index) => ({
        ...shop,
        trustStatus: index % 3 === 0 ? "Verification review" : shop.trustStatus || "Neighbourhood signal",
        investmentReadiness: index % 4 === 0 ? "Internal review" : "Commercial profile",
        merchantStory: `${shop.name} is a neighbourhood ${shop.category.toLowerCase()} business with visible customer activity in ${shop.district || "Cocody"}.`,
      })),
      ...wholesaleShops.slice(0, 6).map((shop) => ({
        ...shop,
        investmentReadiness: "Revenue signals",
        merchantStory: `${shop.name} supplies local buyers and can be reviewed for structured commercial opportunities after verification.`,
      })),
    ],
    [retailShops, wholesaleShops],
  );

  const placePool = exchange ? exchangeShops : wholesale ? wholesaleShops : retailShops;
  const visiblePlaces = useMemo(() => placePool.slice(0, mapDominant ? 18 : wholesale || exchange ? 12 : 10), [exchange, mapDominant, placePool, wholesale]);
  const selectedProducts = useMemo(() => (activeShop ? productsForShop(activeShop) : []), [activeShop]);
  const activeShopImage = activeShop ? selectedProducts[0]?.image || activeShop.image : undefined;
  const orderDraft = activeShop ? orderDrafts[activeShop.id] || {} : {};
  const orderLines = Object.values(orderDraft);
  const subtotal = orderLines.reduce((sum, line) => sum + line.product.priceCfa * line.quantity, 0);
  const retailShopSelected = Boolean(activeShop && !business && !wholesale && !exchange);
  const visibleAgent = retailShopSelected && activeShop ? activeShop.frontDesk : business ? businessAgents[0] : wholesale ? supplierAgent : tassi;
  const quickReplies = retailShopSelected ? shopQuickReplies : business ? businessQuickReplies : exchange ? exchangeQuickReplies : wholesale ? wholesaleQuickReplies : cityQuickReplies;
  const showRightMap = !shopMode && !business;
  const googleMapReady = isGoogleMapReady(mapsConfig);

  useEffect(() => {
    window.localStorage.setItem("exportunity-map-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    setSpace(initialSpace);
    setActiveShop(null);
    setActiveProductDetail(null);
    setAssistantCollapsed(false);
  }, [initialSpace, shellMode]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: [number, number] = [position.coords.latitude, position.coords.longitude];
        if (validPosition(nextLocation)) setUserLocation(nextLocation);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 1000 * 60 * 10 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadMapsConfig() {
      try {
        const response = await fetch("/api/maps/public-config");
        const body = (await response.json()) as PublicMapsConfig;
        if (cancelled) return;
        setMapsConfig({
          provider: body?.provider === "google" ? "google" : "leaflet",
          enabled: Boolean(body?.enabled),
          browserApiKey: body?.browserApiKey || null,
          mapRenderer: body?.mapRenderer,
          businessDataProvider: body?.businessDataProvider,
          placesImportEnabled: Boolean(body?.placesImportEnabled),
          mapId: body?.mapId || body?.mapIdLight || null,
          mapIdLight: body?.mapIdLight || body?.mapId || null,
          mapIdDark: body?.mapIdDark || body?.mapId || body?.mapIdLight || null,
          google: body?.google,
          message: body?.message,
        });
      } catch {
        if (!cancelled) {
          setMapsConfig({
            provider: "leaflet",
            enabled: false,
            browserApiKey: null,
            mapRenderer: "leaflet_openstreetmap",
            businessDataProvider: "curated_city_data",
            placesImportEnabled: false,
            message: "Google Maps configuration could not be read. OpenStreetMap is active.",
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
    let cancelled = false;
    async function loadPlacesStatus() {
      try {
        const type = wholesale ? "wholesale" : "marketplace";
        const query = wholesale ? "wholesale supplier distributor warehouse logistics" : "bakery cafe grocery pharmacy hardware store";
        const response = await fetch(`/api/places/nearby?city=Abidjan&type=${type}&q=${encodeURIComponent(query)}`);
        const body = await response.json();
        if (cancelled) return;
        if (body?.provider === "google") {
          setPlacesStatus({
            provider: "google",
            label: "Google Places active",
            detail: "Live public business listings are available.",
            lastSyncTime: body.lastSyncTime,
          });
        } else {
          setPlacesStatus({
            provider: "curated",
            label: "OpenStreetMap active",
            detail: body?.message || "Curated Abidjan and Cotonou businesses are live. Google Places will replace or enrich them after production keys are configured.",
          });
        }
      } catch {
        if (!cancelled) {
          setPlacesStatus({
            provider: "curated",
            label: "OpenStreetMap active",
            detail: "Curated city businesses are live. Google Places endpoint could not be reached.",
          });
        }
      }
    }
    void loadPlacesStatus();
    return () => {
      cancelled = true;
    };
  }, [wholesale]);

  useEffect(() => {
    const pageLabel = retailShopSelected && activeShop ? `${activeShop.name} shop` : business ? "My Business" : exchange ? "Ready for export" : wholesale ? "Wholesale" : "Explore";
    window.dispatchEvent(
      new CustomEvent("chairman-dock:context", {
        detail: {
          pageKey: retailShopSelected && activeShop ? `shop:${activeShop.id}` : business ? "exportunity-business" : exchange ? "exportunity-pme-exchange" : wholesale ? "exportunity-wholesale" : "exportunity-marketplace",
          pageLabel,
          managerName: visibleAgent.name,
          managerRole: visibleAgent.role,
        },
      }),
    );
  }, [activeShop, business, exchange, retailShopSelected, visibleAgent.name, visibleAgent.role, wholesale]);

  const pushMessage = (message: Omit<ConversationMessage, "id" | "createdAt">) => {
    setMessages((current) => [...current.slice(-9), { ...message, id: `${Date.now()}-${Math.random()}`, createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
  };

  const replyFrom = (agent: CommerceAgent, content: string, shop?: CommerceShop) => {
    window.setTimeout(() => {
      pushMessage({ agentId: agent.id, agentSnapshot: agent, content, shopId: shop?.id });
    }, 220);
  };

  const openSpace = (nextSpace: ConversationSpace) => {
    setSpace(nextSpace);
    setActiveShop(null);
    setActiveProductDetail(null);
    setAssistantCollapsed(false);
    if (nextSpace === "wholesale") onNavigate?.("/wholesale");
    if (nextSpace === "exchange") onNavigate?.("/ready-for-export");
    if (nextSpace === "city") onNavigate?.("/marketplace");
  };

  const previewShop = (shop: CommerceShop) => {
    setActiveShop(shop);
    setActiveProductDetail(null);
    if (space === "shop") setSpace(wholesale ? "wholesale" : exchange ? "exchange" : "city");
  };

  const enterShop = (shop: CommerceShop, initialProduct?: ShopProduct) => {
    setActiveShop(shop);
    setSpace("shop");
    setAssistantCollapsed(true);
    setActiveProductDetail(initialProduct || null);
    if (!orderDrafts[shop.id]) {
      setOrderDrafts((current) => ({ ...current, [shop.id]: current[shop.id] || {} }));
    }
    pushMessage({
      agentId: shop.frontDesk.id,
      agentSnapshot: shop.frontDesk,
      shopId: shop.id,
      content: `Welcome to ${shop.name}. I'm ${shop.frontDesk.name}. The products are open in front of you; pick quantities and I will help with freshness, substitutions, payment, and delivery only when needed.`,
    });
  };

  const updateQuantity = (shop: CommerceShop, product: ShopProduct, quantity: number) => {
    setOrderDrafts((current) => {
      const next = { ...current };
      const shopDraft = { ...(current[shop.id] || {}) };
      const safeQuantity = Math.max(0, Math.min(product.quantityAvailable, quantity));
      if (safeQuantity <= 0) delete shopDraft[product.id];
      else shopDraft[product.id] = { product, quantity: safeQuantity };
      if (Object.keys(shopDraft).length) next[shop.id] = shopDraft;
      else delete next[shop.id];
      return next;
    });
  };

  const quickAddProduct = (shop: CommerceShop, product?: ShopProduct) => {
    if (!product) {
      enterShop(shop);
      replyFrom(shop.frontDesk, "I opened the shop for you. Choose a product and I will help confirm the order.", shop);
      return;
    }
    setActiveShop(shop);
    setSpace("shop");
    setAssistantCollapsed(true);
    setOrderDrafts((current) => {
      const next = { ...current };
      const shopDraft = { ...(current[shop.id] || {}) };
      const currentQuantity = shopDraft[product.id]?.quantity || 0;
      shopDraft[product.id] = {
        product,
        quantity: Math.min(product.quantityAvailable, currentQuantity + 1),
      };
      next[shop.id] = shopDraft;
      return next;
    });
    pushMessage({
      agentId: shop.frontDesk.id,
      agentSnapshot: shop.frontDesk,
      shopId: shop.id,
      content: `${product.name} is in your order at ${shop.name}. You can adjust quantity, add more products, ask me a question, or confirm from the order panel.`,
    });
  };

  const placeOrder = () => {
    if (!activeShop) return;
    if (!orderLines.length) {
      replyFrom(activeShop.frontDesk, "Select at least one product first, then I can confirm the order.", activeShop);
      return;
    }
    const summary = orderLines.map((line) => `${line.product.name} x${line.quantity}`).join(", ");
    pushMessage({ agentId: "user", content: `Place order: ${summary}`, shopId: activeShop.id });
    replyFrom(activeShop.frontDesk, `Confirmed. I am preparing ${summary}. Total is ${formatMoney(subtotal)} before delivery.`, activeShop);
    setOrderDrafts((current) => {
      const next = { ...current };
      delete next[activeShop.id];
      return next;
    });
  };

  const handleAsk = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const lower = text.toLowerCase();
    setInput("");
    pushMessage({ agentId: "user", content: text, shopId: retailShopSelected && activeShop ? activeShop.id : undefined });

    if (retailShopSelected && activeShop) {
      if (lower.includes("availability") || lower.includes("available") || lower.includes("stock") || lower.includes("check")) {
        const product =
          activeProductDetail ||
          selectedProducts.find((item) => lower.includes(item.name.toLowerCase().slice(0, 6))) ||
          selectedProducts[0];
        replyFrom(activeShop.frontDesk, `${product?.name || "This item"} is available at ${activeShop.name}. Select the quantity you want, then confirm from the order panel.`, activeShop);
        return;
      }
      if (lower.includes("deliver")) {
        replyFrom(deliveryAgent, `${activeShop.name} can deliver around Cocody. Route estimate: ${activeShop.eta}.`, activeShop);
        return;
      }
      if (lower.includes("wallet") || lower.includes("pay")) {
        replyFrom(walletAgent, `I can explain the wallet balance and receipt before you confirm payment at ${activeShop.name}.`, activeShop);
        return;
      }
      if (lower.includes("video") || lower.includes("live")) {
        setVideoOpen(true);
        replyFrom(activeShop.frontDesk, "I can start a live product preview. This call is live and not recorded.", activeShop);
        return;
      }
      replyFrom(activeShop.frontDesk, `I am looking at the products here with you. Choose quantities, or tell me the item you need and I will point you to it.`, activeShop);
      return;
    }

    if (business) {
      replyFrom(businessAgents[0], "I shared this with Inventory, Accountant, Delivery Lead, and Marketing. We can turn it into tasks, stock checks, customer follow-ups, or daily actions.");
      return;
    }

    if (lower.includes("wholesale") || lower.includes("supplier") || lower.includes("bulk") || lower.includes("quote") || lower.includes("cement")) {
      setSpace("wholesale");
      const target = wholesaleShops.find((shop) => /building|material|cement|construction/i.test(`${shop.category} ${shop.name}`)) || wholesaleShops[0];
      setActiveShop(target);
      replyFrom(tassi, "I switched to wholesale suppliers. I found supplier candidates with MOQ, lead time, distance, and quote status. Outreach stays approval-gated.");
      return;
    }

    if (lower.includes("pme") || lower.includes("export") || lower.includes("invest") || lower.includes("verified")) {
      setSpace("exchange");
      setActiveShop(exchangeShops[0]);
      replyFrom(tassi, "I switched to Ready for export. These sellers show products, owner proof, trust signals, and compliance status before any finance is reviewed internally.");
      return;
    }

    const target = lower.includes("coffee")
      ? retailShops.find((shop) => shop.category.toLowerCase().includes("cafe") || shop.category.toLowerCase().includes("coffee"))
      : lower.includes("material") || lower.includes("building")
        ? retailShops.find((shop) => /hardware|building/i.test(shop.category))
        : retailShops[0];
    if (target) setActiveShop(target);
    replyFrom(tassi, "I found nearby products and shops. Tap a product or shop to enter, choose items, and place an order. The shop agent helps only when you need it.");
  };

  const handleQuickReply = (reply: string) => {
    if (reply === "Request a quote") {
      handleAsk("I need a wholesale quote for 200 bags of cement");
      return;
    }
    if (reply === "Can I see it live?") {
      setVideoOpen(true);
      return;
    }
    handleAsk(reply);
  };

  const startVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceState("unavailable");
      replyFrom(visibleAgent, `Voice input is not available in this browser. You can type to ${visibleAgent.name} here.`, activeShop || undefined);
      window.setTimeout(() => setVoiceState("idle"), 2200);
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
    setActiveShop(retailShops.find((shop) => /electronics|market|shop/i.test(shop.category)) || retailShops[0]);
    replyFrom(tassi, "I attached the image to this conversation and highlighted nearby shops that can help match it.");
  };

  const selectPlaceFromMap = (shop: CommerceShop) => {
    if (!wholesale && !exchange) {
      enterShop(shop);
      return;
    }
    previewShop(shop);
  };

  const conversationMessages = retailShopSelected && activeShop
    ? messages.filter((message) => message.shopId === activeShop.id || message.agentId === activeShop.frontDesk.id || message.agentId === "user").slice(-8)
    : messages.slice(-8);

  const agentForMessage = (message: ConversationMessage) => {
    if (message.agentSnapshot) return message.agentSnapshot;
    if (message.agentId === "tassi") return tassi;
    if (message.agentId === deliveryAgent.id) return deliveryAgent;
    if (message.agentId === walletAgent.id) return walletAgent;
    return businessAgents.find((agent) => agent.id === message.agentId) || visibleAgent;
  };

  const commerceProducts = visiblePlaces.flatMap((shop) => productsForShop(shop).slice(0, 2).map((product) => ({ shop, product }))).slice(0, wholesale ? 8 : 12);
  const mapShelfProducts = commerceProducts.slice(0, 4);
  const modeTabs: Array<{ label: string; eyebrow: string; description: string; Icon: LucideIcon; active: boolean; onClick: () => void }> = [
    {
      label: "Retail products",
      eyebrow: "Retail",
      description: "Nearby shops, prices, delivery, and product shelves.",
      Icon: Store,
      active: !wholesale && !exchange,
      onClick: () => openSpace("city"),
    },
    {
      label: "Wholesale",
      eyebrow: "Bulk quote",
      description: "Suppliers, MOQ, lead time, and approval-gated outreach.",
      Icon: Warehouse,
      active: wholesale,
      onClick: () => openSpace("wholesale"),
    },
    {
      label: "Ready for export",
      eyebrow: "Export sellers",
      description: "Products, owners, proof, and compliance status.",
      Icon: BriefcaseBusiness,
      active: exchange,
      onClick: () => openSpace("exchange"),
    },
  ];
  const categoryTiles = exchange
    ? [
        ["Export-ready products", Package],
        ["Food sellers", Utensils],
        ["Fashion sellers", Shirt],
        ["Verified sellers", BriefcaseBusiness],
        ["Compliance review", FileText],
      ]
    : wholesale
      ? [
          ["Suppliers", Warehouse],
          ["Materials", Hammer],
          ["Machinery", Factory],
          ["Packaging", Package],
          ["Logistics", Truck],
        ]
      : [
          ["Breakfast", Utensils],
          ["Fresh bread", Store],
          ["Coffee", Coffee],
          ["Organic", Leaf],
          ["Pharmacy", Pill],
          ["Materials", Hammer],
        ];

  const assistantRailActions: Array<{ label: string; Icon: LucideIcon; onClick: () => void }> = [
    { label: "Retail", Icon: Store, onClick: () => openSpace("city") },
    { label: "Wholesale", Icon: Warehouse, onClick: () => openSpace("wholesale") },
    { label: "Export", Icon: BriefcaseBusiness, onClick: () => openSpace("exchange") },
    { label: "Voice", Icon: Mic, onClick: startVoice },
    { label: "Photo", Icon: Camera, onClick: () => fileInputRef.current?.click() },
  ];

  const shellGridClass = mapDominant
    ? assistantCollapsed
      ? "lg:grid-cols-[minmax(0,1fr)_72px]"
      : "lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]"
    : showRightMap
      ? assistantCollapsed
        ? "lg:grid-cols-[minmax(0,1fr)_320px_72px] xl:grid-cols-[minmax(0,1fr)_360px_72px] 2xl:grid-cols-[minmax(0,1fr)_390px_72px]"
        : "lg:grid-cols-[minmax(0,1fr)_320px_292px] xl:grid-cols-[minmax(0,1fr)_360px_304px] 2xl:grid-cols-[minmax(0,1fr)_390px_316px]"
      : assistantCollapsed
        ? "lg:grid-cols-[minmax(0,1fr)_72px] xl:grid-cols-[minmax(0,1fr)_72px]"
        : "lg:grid-cols-[minmax(0,1fr)_292px] xl:grid-cols-[minmax(0,1fr)_304px]";

  const assistantPane = (
    <aside className={cn("hidden min-h-0 flex-col border-l lg:flex", assistantCollapsed && "items-center", dark ? "border-white/10 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950")}>
      {assistantCollapsed ? (
        <div className="flex h-full w-full flex-col items-center gap-3 p-3">
          <button
            type="button"
            onClick={() => setAssistantCollapsed(false)}
            className={cn("grid h-11 w-11 place-items-center rounded-2xl border", dark ? "border-white/12 bg-white/[0.05] text-white hover:bg-white/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
            aria-label={`Expand ${visibleAgent.name} command pane`}
          >
            <MessageCircle className="h-5 w-5" />
          </button>
          <AgentAvatar agent={visibleAgent} size="md" />
          {assistantRailActions.map(({ Icon: RailIcon, label, onClick }) => {
            return (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className={cn("grid h-11 w-11 place-items-center rounded-2xl border transition hover:-translate-y-0.5", dark ? "border-white/12 bg-white/[0.04] text-white/70 hover:border-[#F5A623]/60 hover:text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#F5A623]/60 hover:text-slate-950")}
                title={label}
                aria-label={label}
              >
                <RailIcon className="h-5 w-5" />
              </button>
            );
          })}
          <div className="mt-auto [writing-mode:vertical-rl] rotate-180 text-[10px] font-black uppercase tracking-[0.22em] text-[#F5A623]">
            {visibleAgent.name}
          </div>
        </div>
      ) : (
        <>
      <div className="border-b border-current/10 p-4">
        <div className="flex items-center gap-3">
          <AgentAvatar agent={visibleAgent} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-lg font-black">{visibleAgent.name}</div>
            <div className={cn("text-xs font-bold", dark ? "text-white/58" : "text-slate-500")}>
              {retailShopSelected ? `${visibleAgent.role} for ${activeShop?.name}` : business ? "Business operating agent" : wholesale ? "Wholesale sourcing agent" : exchange ? "Export scout" : "Concierge"}
            </div>
          </div>
          <span className="ml-auto rounded-full bg-emerald-500/12 px-2 py-1 text-[11px] font-black text-emerald-600">Online</span>
          <button
            type="button"
            onClick={() => setAssistantCollapsed(true)}
            className={cn("grid h-9 w-9 place-items-center rounded-full border", dark ? "border-white/12 text-white/62 hover:bg-white/8" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
            aria-label="Collapse command pane"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </button>
        </div>
        <div className={cn("mt-4 rounded-2xl border p-3 text-sm leading-relaxed", dark ? "border-white/10 bg-white/[0.045] text-white/76" : "border-slate-200 bg-slate-50 text-slate-650")}>
          {retailShopSelected && activeShop
                ? `${visibleAgent.name} works for this shop. Products and the order panel are the main flow; this chat is here for stock, substitutions, wallet, delivery, or live preview.`
            : business
              ? "Run the business by talking to your agents. They report issues, create actions, and coordinate the shop."
              : wholesale
                ? "Find suppliers, request quotes, and keep outreach approval-gated."
                : exchange
                  ? "Review export-ready sellers, products, trust proof, and compliance status. Finance stays internal-review only."
                  : "Tassi helps you find products faster. The center stays focused on products, shops, prices, and delivery."}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {conversationMessages.map((message) => (
          <MessageBubble key={message.id} message={message} dark={dark} agent={agentForMessage(message)} />
        ))}
      </div>

      <div className="border-t border-current/10 p-4">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {quickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => handleQuickReply(reply)}
              className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-black transition hover:-translate-y-0.5", dark ? "border-white/12 bg-white/[0.04] text-white hover:border-[#F5A623]/60" : "border-slate-200 bg-slate-50 text-slate-800 hover:border-[#F5A623]/50")}
            >
              {reply}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleAsk(input);
          }}
          className={cn("space-y-2 rounded-3xl border-2 p-2.5", dark ? "border-[#F5A623]/34 bg-[#05070B]" : "border-[#F5A623]/55 bg-white shadow-[0_10px_24px_rgba(245,166,35,.12)]")}
        >
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handlePhoto(event.target.files?.[0])} />
          <div className={cn("flex items-center gap-2 rounded-2xl px-3 py-2.5", dark ? "bg-white/[0.055]" : "bg-slate-50")}>
            <Search className={cn("h-4 w-4 shrink-0", dark ? "text-white/48" : "text-slate-400")} />
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={retailShopSelected ? `Search this shelf or ask ${visibleAgent.name}...` : "Search products near me..."}
              className={cn("min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-current/50", dark ? "text-white" : "text-slate-950")}
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Attach file">
              <Paperclip className="h-4 w-4" />
            </button>
            <button type="button" onClick={startVoice} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", voiceState === "listening" ? "bg-red-500 text-white" : dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Tap to speak">
              {voiceState === "listening" ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Photo search">
              <Camera className="h-4 w-4" />
            </button>
            <button type="submit" className="ml-auto inline-flex h-9 items-center gap-2 rounded-full bg-[#F5A623] px-4 text-sm font-black text-[#07111F]" aria-label={`Send to ${visibleAgent.name}`}>
              <span>Send</span>
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
        {voiceState === "listening" || voiceState === "unavailable" ? (
          <div className={cn("mt-2 text-xs font-bold", voiceState === "listening" ? "text-red-500" : dark ? "text-white/58" : "text-slate-500")}>{voiceState === "listening" ? "Listening..." : "Voice is unavailable in this browser."}</div>
        ) : null}
      </div>
        </>
      )}
    </aside>
  );

  const mobileBottomNav = !shopMode ? (
    <nav className={cn("fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+8px)] z-50 grid grid-cols-5 rounded-[24px] border px-1.5 py-1.5 lg:hidden", dark ? "border-white/10 bg-[#07111F] text-white shadow-[0_-18px_44px_rgba(0,0,0,.34)]" : "border-slate-200 bg-white text-slate-950 shadow-[0_-18px_44px_rgba(15,23,42,.16)]")} aria-label="Exportunity mobile navigation">
      {[
        { label: "Explore", Icon: Store, active: !wholesale && !exchange && !business, onClick: () => openSpace("city") },
        { label: "Nearby", Icon: MapIcon, active: false, onClick: () => { openSpace("city"); onNavigate?.("/map"); } },
        { label: "Chat", Icon: MessageCircle, active: false, onClick: () => { setAssistantCollapsed(false); window.setTimeout(() => inputRef.current?.focus(), 50); } },
        { label: "Orders", Icon: ShoppingBag, active: false, onClick: () => onNavigate?.("/orders") },
        { label: "Export", Icon: BriefcaseBusiness, active: exchange, onClick: () => openSpace("exchange") },
      ].map(({ label, Icon, active, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className={cn("flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[18px] px-1 py-1.5 text-[10px] font-black transition", active ? "bg-[#F5A623] text-[#07111F]" : dark ? "text-white/66 hover:bg-white/8 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950")}
          aria-current={active ? "page" : undefined}
        >
          <Icon className="h-5 w-5" />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </nav>
  ) : null;

  const mobileComposer = (
    <div className={cn("fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+78px)] z-50 rounded-[26px] border p-1.5 lg:hidden", dark ? "border-white/10 bg-[#07111F] text-white shadow-[0_-18px_44px_rgba(0,0,0,.32)]" : "border-[#F5A623]/45 bg-white text-slate-950 shadow-[0_-18px_44px_rgba(15,23,42,.16)]")}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleAsk(input);
        }}
        className={cn("flex items-center gap-1.5 rounded-3xl border-2 p-1.5", dark ? "border-[#F5A623]/34 bg-[#05070B]" : "border-[#F5A623]/55 bg-white")}
      >
        <button type="button" onClick={() => fileInputRef.current?.click()} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Attach product photo">
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={retailShopSelected && activeShop ? `Search shelf or ask ${visibleAgent.name}...` : "Search products or ask Tassi..."}
          className={cn("min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold outline-none placeholder:text-current/46", dark ? "text-white" : "text-slate-950")}
        />
        <button type="button" onClick={startVoice} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", voiceState === "listening" ? "bg-red-500 text-white" : dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Tap to speak">
          {voiceState === "listening" ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Photo search">
          <Camera className="h-5 w-5" />
        </button>
        <button type="submit" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F5A623] text-[#07111F]" aria-label={`Send to ${visibleAgent.name}`}>
          <Send className="h-5 w-5" />
        </button>
      </form>
      {voiceState === "listening" || voiceState === "unavailable" ? (
        <div className={cn("mt-2 text-xs font-bold", voiceState === "listening" ? "text-red-500" : dark ? "text-white/58" : "text-slate-500")}>{voiceState === "listening" ? "Listening..." : "Voice is unavailable in this browser."}</div>
      ) : null}
    </div>
  );

  const mobileShopOrderBar = shopMode && activeShop && orderLines.length ? (
    <div className={cn("fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-50 rounded-[24px] border p-3 lg:hidden", dark ? "border-white/12 bg-[#07111F] text-white shadow-[0_-18px_44px_rgba(0,0,0,.36)]" : "border-[#F5A623]/45 bg-white text-slate-950 shadow-[0_-18px_44px_rgba(15,23,42,.18)]")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#F5A623]/18 px-2.5 py-1 text-[11px] font-black text-[#F5A623]">
              {orderLines.reduce((sum, line) => sum + line.quantity, 0)} selected
            </span>
            <span className={cn("truncate text-xs font-bold", dark ? "text-white/58" : "text-slate-500")}>{activeShop.name}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-black">{formatMoney(subtotal)}</span>
            <span className={cn("truncate text-xs font-semibold", dark ? "text-white/54" : "text-slate-500")}>
              {orderLines[0]?.product.name}{orderLines.length > 1 ? ` +${orderLines.length - 1}` : ""} · {activeShop.eta}
            </span>
          </div>
        </div>
        <button type="button" onClick={placeOrder} className="h-12 shrink-0 rounded-2xl bg-[#F5A623] px-5 text-sm font-black text-[#07111F] shadow-[0_12px_28px_rgba(245,166,35,.3)] transition hover:bg-[#F9A800]">
          Place order
        </button>
      </div>
    </div>
  ) : null;

  const shopCenter = shopMode && activeShop ? (
    <main className={cn("min-h-0 overflow-auto pb-28 lg:pb-0", dark ? "bg-[#05070B]" : "bg-[#F7F8FA]")}>
      <div className="p-3 md:p-6">
        <button type="button" onClick={() => setSpace(wholesale ? "wholesale" : exchange ? "exchange" : "city")} className={cn("mb-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black md:mb-4", dark ? "border-white/12 text-white/72 hover:bg-white/8" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
          <ArrowLeft className="h-4 w-4" /> Back to discovery
        </button>
        <section className={cn("overflow-hidden rounded-[24px] border md:rounded-[28px]", dark ? "border-white/12 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,.08)]")}>
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_310px]">
            <div className="min-w-0">
              <div className="relative h-40 overflow-hidden md:h-56">
                <img src={activeShopImage || activeShop.image} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white md:bottom-5 md:left-5 md:right-5">
                  <div className="mb-2 inline-flex rounded-full bg-[#F5A623] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#07111F] md:mb-3 md:text-[11px]">Products inside shop</div>
                  <h1 className="text-2xl font-black md:text-3xl">{activeShop.name}</h1>
                  <p className="mt-0.5 text-xs font-semibold text-white/78 md:mt-1 md:text-sm">{activeShop.category} - {activeShop.openLabel} - {activeShop.distance} - {activeShop.eta}</p>
                </div>
              </div>
              <div className="p-4 md:p-5">
                <div className="grid gap-3 md:grid-cols-[1fr_220px] md:gap-4">
                  <div>
                    <h2 className="text-lg font-black md:text-xl">Choose products</h2>
                    <p className={cn("mt-1 text-xs leading-relaxed md:text-sm", dark ? "text-white/62" : "text-slate-600")}>
                      Pick quantities, then confirm from the order panel. {activeShop.frontDesk.name} is here for availability, substitutions, payment, and delivery.
                    </p>
                  </div>
                  <div className={cn("rounded-2xl border p-2.5 md:p-3", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50")}>
                    <div className="flex items-center gap-3">
                      <AgentAvatar agent={activeShop.frontDesk} />
                      <div>
                        <div className="text-sm font-black">{activeShop.frontDesk.name}</div>
                        <div className={cn("text-xs font-bold", dark ? "text-white/55" : "text-slate-500")}>Shop Front Desk</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 md:mt-5 md:gap-4 2xl:grid-cols-3">
                  {selectedProducts.map((product) => {
                    const quantity = orderDraft[product.id]?.quantity || 0;
                    return (
                      <article key={product.id} className={cn("overflow-hidden rounded-2xl border transition hover:-translate-y-0.5", dark ? "border-white/12 bg-white/[0.04] hover:border-[#F5A623]/45" : "border-slate-200 bg-white hover:border-[#F5A623]/45 hover:shadow-[0_18px_44px_rgba(15,23,42,.08)]")}>
                        <button type="button" onClick={() => setActiveProductDetail(product)} className="block w-full text-left" aria-label={`View ${product.name}`}>
                          <img src={product.image} alt={product.name} className="h-24 w-full object-cover md:h-36" />
                        </button>
                        <div className="p-3 md:p-4">
                          <button type="button" onClick={() => setActiveProductDetail(product)} className="flex w-full items-start justify-between gap-3 text-left" aria-label={`Open ${product.name} details`}>
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-black md:text-base">{product.name}</h3>
                              <p className={cn("mt-0.5 line-clamp-1 text-[11px] leading-relaxed md:mt-1 md:line-clamp-2 md:text-xs", dark ? "text-white/58" : "text-slate-600")}>{product.description}</p>
                            </div>
                            <span className="shrink-0 text-xs font-black text-[#F5A623] md:text-sm">{formatMoney(product.priceCfa)}</span>
                          </button>
                          <div className={cn("mt-2 flex items-center justify-between text-[11px] md:mt-3 md:text-xs", dark ? "text-white/55" : "text-slate-500")}>
                            <span>{product.unit}</span>
                            <span>{product.quantityAvailable} available</span>
                          </div>
                          <div className="relative z-10 mt-3 flex items-center justify-between gap-3 md:mt-4">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => updateQuantity(activeShop, product, quantity - 1)} className={cn("grid h-8 w-8 place-items-center rounded-xl border md:h-9 md:w-9", dark ? "border-white/20 hover:bg-white/10" : "border-slate-300 hover:bg-slate-100")} aria-label={`Reduce ${product.name}`}>
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-8 text-center text-sm font-black md:min-w-9">{quantity}</span>
                              <button type="button" onClick={() => updateQuantity(activeShop, product, quantity + 1)} className="grid h-8 w-8 place-items-center rounded-xl bg-[#F5A623] text-[#07111F] shadow-[0_10px_22px_rgba(245,166,35,.28)] transition hover:bg-[#F9A800] md:h-9 md:w-9" aria-label={`Add ${product.name}`}>
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                            {quantity ? <span className="rounded-full bg-[#F5A623]/16 px-3 py-1 text-xs font-black text-[#F5A623]">Selected</span> : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {(() => {
                  const identity = merchantIdentity(activeShop);
                  return (
                    <div className={cn("mt-5 rounded-2xl border p-4", dark ? "border-white/10 bg-white/[0.035]" : "border-slate-200 bg-slate-50")}>
                      <div className="grid gap-4 md:grid-cols-[68px_minmax(0,1fr)]">
                        <img src={identity.portraitUrl} alt={`${identity.ownerName}, ${activeShop.name}`} className="h-16 w-16 rounded-2xl object-cover" />
                        <div className="min-w-0">
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#F5A623]">Shop owner and trust</div>
                          <h2 className="mt-1 text-xl font-black">{identity.ownerName} at {activeShop.name}</h2>
                          <p className={cn("mt-1 text-sm leading-relaxed", dark ? "text-white/62" : "text-slate-600")}>{identity.story}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {identity.proof.map((item) => (
                              <span key={item} className={cn("rounded-full border px-3 py-1 text-xs font-black", dark ? "border-white/12 bg-white/[0.04] text-white/72" : "border-slate-200 bg-white text-slate-700")}>{item}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            <aside className={cn("border-t p-5 xl:border-l xl:border-t-0", dark ? "border-white/10 bg-[#05070B]/42" : "border-slate-200 bg-slate-50/86")}>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#F5A623]">Your order</div>
              <div className={cn("mt-3 rounded-2xl border p-3", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white")}>
                <div className="flex items-start gap-3">
                  <AgentAvatar agent={activeShop.frontDesk} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-black">{activeShop.frontDesk.name}</div>
                    <div className={cn("text-xs font-bold", dark ? "text-white/52" : "text-slate-500")}>Shop Front Desk</div>
                    <p className={cn("mt-2 text-xs leading-relaxed", dark ? "text-white/66" : "text-slate-600")}>
                      Welcome to {activeShop.name}. Pick products from the shelf; I can confirm freshness, substitutions, wallet payment, and delivery before you place the order.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {orderLines.length ? (
                  orderLines.map((line) => (
                    <div key={line.product.id} className={cn("rounded-xl border px-3 py-2 text-sm", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white")}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-bold">{line.product.name}</span>
                        <span className="font-black">x{line.quantity}</span>
                      </div>
                      <div className={cn("mt-1 text-xs", dark ? "text-white/55" : "text-slate-500")}>{formatMoney(line.product.priceCfa * line.quantity)}</div>
                    </div>
                  ))
                ) : (
                <div className={cn("rounded-xl border px-3 py-4 text-sm font-semibold", dark ? "border-white/10 bg-white/[0.04] text-white/64" : "border-slate-200 bg-white text-slate-600")}>
                  Choose products from the shelf. Your order appears here with quantities and subtotal.
                </div>
                )}
              </div>
              {!orderLines.length ? (
                <div className="mt-3 grid gap-2">
                  {["What is fresh?", "Best seller", "Use wallet"].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleAsk(prompt)}
                      className={cn("h-10 rounded-2xl border text-sm font-black", dark ? "border-white/14 text-white/74 hover:bg-white/8" : "border-slate-200 bg-white text-slate-700 hover:border-[#F5A623]/50")}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 border-t pt-4" style={{ borderColor: dark ? "rgba(255,255,255,.14)" : "rgba(15,23,42,.12)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span className={dark ? "text-white/62" : "text-slate-600"}>Subtotal</span>
                  <span className="font-black">{formatMoney(subtotal)}</span>
                </div>
                <div className={cn("mt-2 rounded-xl border px-3 py-2 text-xs font-bold", dark ? "border-white/10 bg-white/[0.04] text-white/58" : "border-slate-200 bg-white text-slate-600")}>
                  Delivery estimate: {activeShop.eta}. The shop confirms payment and delivery details after you place the order.
                </div>
                <button type="button" onClick={placeOrder} disabled={!orderLines.length} className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-[#F5A623] text-sm font-black text-[#07111F] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                  Place order
                </button>
                <button type="button" onClick={() => handleAsk("Can you deliver?")} className={cn("mt-2 h-10 w-full rounded-2xl border text-sm font-black", dark ? "border-white/14 text-white/74 hover:bg-white/8" : "border-slate-200 text-slate-700 hover:bg-white")}>
                  Delivery help
                </button>
              </div>
            </aside>
          </div>
        </section>
        {activeProductDetail ? (
          <section className={cn("fixed inset-x-3 bottom-[118px] z-40 mx-auto max-w-3xl overflow-hidden rounded-[26px] border shadow-[0_28px_80px_rgba(15,23,42,.28)] lg:absolute lg:inset-auto lg:bottom-6 lg:right-6 lg:w-[440px]", dark ? "border-white/12 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950")}>
            <div className="grid max-h-[72vh] overflow-auto">
              <div className="relative h-44">
                <img src={activeProductDetail.image} alt={activeProductDetail.name} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                <button type="button" onClick={() => setActiveProductDetail(null)} className="absolute right-3 top-3 rounded-full bg-white/92 px-3 py-2 text-xs font-black text-slate-950">Close</button>
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#F5A623]">Product detail</div>
                  <h3 className="mt-1 text-2xl font-black">{activeProductDetail.name}</h3>
                </div>
              </div>
              <div className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xl font-black text-[#F5A623]">{formatMoney(activeProductDetail.priceCfa)}</div>
                    <p className={cn("mt-1 text-sm leading-relaxed", dark ? "text-white/62" : "text-slate-600")}>{activeProductDetail.description}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-black", dark ? "border-white/12 bg-white/[0.05]" : "border-slate-200 bg-slate-50")}>{activeProductDetail.unit}</span>
                </div>
                <div className={cn("grid grid-cols-3 gap-2 rounded-2xl border p-3 text-center text-xs", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50")}>
                  <div>
                    <div className="font-black">{activeProductDetail.quantityAvailable}</div>
                    <div className={dark ? "text-white/55" : "text-slate-500"}>available</div>
                  </div>
                  <div>
                    <div className="font-black">{activeShop?.distance}</div>
                    <div className={dark ? "text-white/55" : "text-slate-500"}>distance</div>
                  </div>
                  <div>
                    <div className="font-black">{activeShop?.eta}</div>
                    <div className={dark ? "text-white/55" : "text-slate-500"}>delivery</div>
                  </div>
                </div>
                <div className={cn("sticky bottom-0 z-20 -mx-4 -mb-4 grid grid-cols-[1fr_1fr] gap-2 border-t p-4 backdrop-blur-xl", dark ? "border-white/10 bg-[#07111F]/95" : "border-slate-200 bg-white/95")}>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeShop && activeProductDetail) {
                        updateQuantity(activeShop, activeProductDetail, (orderDraft[activeProductDetail.id]?.quantity || 0) + 1);
                        replyFrom(activeShop.frontDesk, `${activeProductDetail.name} is available. I added one to your order; adjust quantity before confirming if needed.`, activeShop);
                      }
                    }}
                    className="h-12 rounded-2xl bg-[#F5A623] text-sm font-black text-[#07111F]"
                  >
                    Add to order
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeShop) handleAsk(`Check availability for ${activeProductDetail.name}`);
                    }}
                    className={cn("h-12 rounded-2xl border text-sm font-black", dark ? "border-white/14 text-white/74 hover:bg-white/8" : "border-slate-200 text-slate-700 hover:bg-slate-50")}
                  >
                    Check availability
                  </button>
                </div>
                <div className={cn("rounded-2xl border p-3 text-sm leading-relaxed", dark ? "border-white/10 bg-white/[0.04] text-white/62" : "border-slate-200 bg-slate-50 text-slate-600")}>
                  {activeShop?.frontDesk.name || "The shop Front Desk"} can confirm freshness, substitutions, delivery notes, and wallet payment before checkout.
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  ) : null;

  const businessCenter = business ? (
    <main className={cn("min-h-0 overflow-auto p-4 pb-56 md:p-6 lg:pb-6", dark ? "bg-[#05070B]" : "bg-[#F7F8FA]")}>
      <section className={cn("rounded-[28px] border p-5", dark ? "border-white/12 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,.08)]")}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#F5A623]">My Business</div>
                  <h1 className="mt-2 text-3xl font-black">Business team room</h1>
            <p className={cn("mt-1 text-sm", dark ? "text-white/60" : "text-slate-600")}>Talk to Front Desk, Inventory, Accountant, Delivery Lead, and Marketing from one business conversation.</p>
          </div>
          <div className="flex -space-x-2">
            {businessAgents.slice(0, 5).map((agent) => <AgentAvatar key={agent.id} agent={agent} />)}
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            {[
              ["front-desk", "We have 8 active customer conversations. Breakfast and delivery are the top requests."],
              ["inventory", "Croissants and whole wheat bread are low. I recommend restocking before noon."],
              ["accountant", "Today sales are 142,500 XAF. Wallet receipts are reconciled."],
              ["delivery-lead", "Two deliveries are complete. One route to Riviera 3 is next."],
              ["marketing", "Weekend breakfast bundle is ready to publish after owner approval."],
            ].map(([agentId, content]) => {
              const agent = businessAgents.find((item) => item.id === agentId) || businessAgents[0];
              return <MessageBubble key={agentId} message={{ id: agentId, agentId, content, createdAt: "today", agentSnapshot: agent }} dark={dark} agent={agent} />;
            })}
          </div>
          <aside className={cn("rounded-2xl border p-4", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50")}>
            <div className="text-sm font-black">Needs attention</div>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ["Low stock", "3 items"],
                ["Pending delivery", "1 route"],
                ["Customer replies", "8 active"],
                ["Promo approval", "1 campaign"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className={dark ? "text-white/62" : "text-slate-600"}>{label}</span>
                  <span className="font-black">{value}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  ) : null;

  const discoveryCenter = !shopMode && !business ? (
    <main className={cn("min-h-0 overflow-auto pb-72 lg:pb-0", dark ? "bg-[#05070B]" : "bg-[#F7F8FA]")}>
      <div className="space-y-2.5 p-3 md:space-y-5 md:p-6">
        <section className={cn("overflow-hidden rounded-[20px] border p-2.5 md:rounded-[26px] md:p-4", dark ? "border-white/12 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,.08)]")}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#F5A623] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#07111F]">
                  {exchange ? "Ready for export" : wholesale ? "Wholesale" : "Retail marketplace"}
                </span>
                <span className={cn("rounded-full border px-3 py-1 text-[11px] font-black", dark ? "border-white/12 text-white/62" : "border-slate-200 text-slate-600")}>Cocody, Abidjan</span>
                {isAdmin ? <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-[11px] font-black text-emerald-600">Admin view</span> : null}
              </div>
              <h1 className="mt-2 max-w-4xl text-lg font-black leading-tight tracking-tight md:text-2xl">
                {exchange ? "Browse export-ready products and sellers." : wholesale ? "Source suppliers, quantities, MOQ, and routes." : "Buy nearby products from real local shops."}
              </h1>
              <p className={cn("mt-1 hidden max-w-3xl text-sm leading-relaxed sm:block", dark ? "text-white/64" : "text-slate-600")}>
                {exchange
                  ? "Start with products and sellers, then review people, place, proof, and compliance status. Finance remains admin-only until approved."
                  : wholesale
                    ? "Search suppliers, compare lead time and distance, then request a quote through an approval-gated workflow."
                    : "Pick a product, enter the shop, adjust quantities, and let the shop Front Desk help only when useful."}
              </p>
            </div>
            <div className={cn("hidden shrink-0 grid-cols-3 gap-2 rounded-[18px] border px-2 py-2 text-center sm:grid md:px-3", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50")}>
              {[
                [String(visiblePlaces.length), exchange ? "sellers" : wholesale ? "suppliers" : "shops"],
                [String(commerceProducts.length), exchange ? "products" : wholesale ? "offers" : "products"],
                [googleMapReady ? "Google" : "OSM", "map"],
              ].map(([value, label]) => (
                <div key={label} className="min-w-[76px]">
                  <div className="text-base font-black">{value}</div>
                  <div className={cn("mt-0.5 text-[10px] font-black uppercase tracking-[0.14em]", dark ? "text-white/48" : "text-slate-500")}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex gap-2 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible md:pb-0">
          {modeTabs.map(({ label, eyebrow, description, Icon, active, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className={cn(
                "group flex min-h-[48px] min-w-[132px] shrink-0 items-center justify-start gap-2 rounded-full border px-2.5 py-2 text-left transition hover:-translate-y-0.5 md:min-h-[94px] md:min-w-0 md:flex-row md:gap-3 md:rounded-[24px] md:p-3",
                active
                  ? "border-[#F5A623] bg-[#F5A623] text-[#07111F] shadow-[0_18px_42px_rgba(245,166,35,.22)]"
                  : dark
                    ? "border-white/10 bg-[#07111F] text-white hover:border-[#F5A623]/55"
                    : "border-slate-200 bg-white text-slate-950 hover:border-[#F5A623]/55 hover:shadow-[0_14px_34px_rgba(15,23,42,.08)]",
              )}
              aria-pressed={active}
            >
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full md:h-14 md:w-14 md:rounded-[20px]", active ? "bg-[#07111F] text-[#F5A623]" : "bg-[#F5A623]/16 text-[#F5A623]")}>
                <Icon className="h-4 w-4 md:h-7 md:w-7" />
              </span>
              <span className="min-w-0">
                <span className={cn("hidden text-[10px] font-black uppercase tracking-[0.16em] lg:block", active ? "text-[#07111F]/62" : dark ? "text-white/45" : "text-slate-500")}>{eyebrow}</span>
                <span className="block truncate text-[11px] font-black leading-tight md:mt-0.5 md:text-base">{label}</span>
                <span className={cn("mt-1 hidden line-clamp-2 text-xs font-semibold leading-snug xl:block", active ? "text-[#07111F]/72" : dark ? "text-white/56" : "text-slate-600")}>{description}</span>
              </span>
            </button>
          ))}
        </section>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {categoryTiles.map(([label, Icon]) => {
            const text = String(label);
            const visual = visualForCategory(text, wholesale, exchange);
            return (
              <CategoryTile
                key={text}
                label={text}
                Icon={Icon as LucideIcon}
                kind={visual.kind}
                hint={categoryHint(text, wholesale, exchange)}
                dark={dark}
                onClick={() => handleQuickReply(text)}
              />
            );
          })}
        </div>

        {exchange ? (
          <section className={cn("grid gap-2 rounded-[22px] border p-3 md:grid-cols-4", dark ? "border-white/12 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950 shadow-[0_12px_26px_rgba(15,23,42,.06)]")}>
            {[
              {
                label: "Seller coverage",
                value: `${visiblePlaces.length} profiles`,
                detail: "People, place, proof, products",
                ok: true,
              },
              {
                label: "Google Maps",
                value: googleMapReady ? "Renderer active" : "OSM fallback",
                detail: googleMapReady ? "Browser map key is verified for the public map" : "Google setup is incomplete; OpenStreetMap is active",
                ok: googleMapReady,
              },
              {
                label: "Google Places",
                value: mapsConfig.placesImportEnabled ? "Import live" : "Curated data",
                detail: mapsConfig.placesImportEnabled ? "Public listings can enrich seller leads" : "Server Places key/import env still required",
                ok: Boolean(mapsConfig.placesImportEnabled),
              },
              {
                label: "Compliance",
                value: "Compliance gated",
                detail: "No public offers before legal approval",
                ok: true,
              },
            ].map((item) => (
              <div key={item.label} className={cn("rounded-2xl border px-3 py-2", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50")}>
                <div className="flex items-center justify-between gap-2">
                  <div className={cn("text-[11px] font-black uppercase tracking-[0.16em]", dark ? "text-white/50" : "text-slate-500")}>{item.label}</div>
                  <span className={cn("h-2.5 w-2.5 rounded-full", item.ok ? "bg-emerald-500" : "bg-amber-500")} />
                </div>
                <div className="mt-1 text-sm font-black">{item.value}</div>
                <div className={cn("mt-0.5 line-clamp-2 text-[11px] leading-snug", dark ? "text-white/56" : "text-slate-600")}>{item.detail}</div>
              </div>
            ))}
          </section>
        ) : null}

        {activeShop ? (
          <section className={cn("rounded-[26px] border p-4", dark ? "border-[#F5A623]/24 bg-[#F5A623]/10 text-white" : "border-[#F5A623]/35 bg-[#F5A623]/10 text-slate-950")}>
            <div className="grid gap-4 lg:grid-cols-[170px_minmax(0,1fr)_260px] lg:items-center">
              <img src={activeShopImage || activeShop.image} alt="" className="h-32 w-full rounded-2xl object-cover lg:h-28" />
              <div className="min-w-0">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#F5A623]">{wholesale || exchange ? "Quick review" : "Ready to buy"}</div>
                <h2 className="mt-1 truncate text-2xl font-black">{activeShop.name}</h2>
                <p className={cn("mt-1 text-sm font-semibold", dark ? "text-white/62" : "text-slate-600")}>
                  {activeShop.category} - Rating {activeShop.rating.toFixed(1)} - {activeShop.distance} - {activeShop.eta}
                </p>
                {(() => {
                  const identity = merchantIdentity(activeShop);
                  return (
                    <div className="mt-3 flex items-center gap-3">
                      <img src={identity.portraitUrl} alt={`${identity.ownerName}, ${activeShop.name}`} className="h-10 w-10 rounded-full object-cover ring-2 ring-[#F5A623]/40" />
                      <div className="min-w-0">
                        <div className="text-sm font-black">{identity.ownerName}</div>
                        <div className={cn("truncate text-xs", dark ? "text-white/58" : "text-slate-600")}>{identity.years} years in {activeShop.district || "Cocody"} - {activeShop.trustStatus || "Trust building"}</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="mt-3 flex flex-wrap gap-2">
                  {productsForShop(activeShop).slice(0, 3).map((product) => (
                    <span key={product.id} className={cn("rounded-full border px-3 py-1 text-xs font-black", dark ? "border-white/14 bg-white/[0.05]" : "border-slate-200 bg-white")}>{product.name}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 lg:flex-col">
                {wholesale ? (
                  <button type="button" onClick={() => handleAsk("Request a quote")} className="flex-1 rounded-2xl bg-[#F5A623] px-4 py-3 text-sm font-black text-[#07111F]">Request quote</button>
                ) : exchange ? (
                  <button type="button" onClick={() => handleAsk("Review this seller")} className="flex-1 rounded-2xl bg-[#F5A623] px-4 py-3 text-sm font-black text-[#07111F]">Review profile</button>
                ) : (
                  <>
                    <button type="button" onClick={() => enterShop(activeShop)} className="flex-1 rounded-2xl bg-[#F5A623] px-4 py-3 text-sm font-black text-[#07111F]">Open products</button>
                    <button type="button" onClick={() => quickAddProduct(activeShop, productsForShop(activeShop)[0])} className={cn("flex-1 rounded-2xl border px-4 py-3 text-sm font-black", dark ? "border-white/14 text-white/72" : "border-slate-200 bg-white text-slate-700")}>Add top product</button>
                  </>
                )}
                <button type="button" onClick={() => setActiveShop(null)} className={cn("rounded-2xl border px-4 py-3 text-sm font-black", dark ? "border-white/14 text-white/72" : "border-slate-200 bg-white text-slate-700")}>Close</button>
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">{wholesale ? "Supplier offers" : exchange ? "Export-ready sellers" : "Products near you"}</h2>
              <p className={cn("text-sm", dark ? "text-white/56" : "text-slate-600")}>
                {wholesale ? "Quote-ready suppliers with MOQ and lead time." : exchange ? "People, place, proof, and compliance status before any finance." : "Start with products, then enter the shop when you are ready."}
              </p>
            </div>
            <button type="button" onClick={() => onNavigate?.("/map")} className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black", dark ? "border-white/12 text-white/72" : "border-slate-200 bg-white text-slate-700")}>
              <MapIcon className="h-4 w-4" /> <span className="hidden sm:inline">Open map</span><span className="sm:hidden">Map</span>
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {commerceProducts.map(({ shop, product }) => {
              const visual = visualForCategory(shop.category, wholesale, exchange);
              const Icon = visual.Icon;
              return (
                <article key={`${shop.id}-${product.id}`} className={cn("overflow-hidden rounded-2xl border transition hover:-translate-y-0.5", dark ? "border-white/12 bg-[#07111F] hover:border-[#F5A623]/45" : "border-slate-200 bg-white hover:border-[#F5A623]/45 hover:shadow-[0_18px_44px_rgba(15,23,42,.09)]")}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => (wholesale || exchange ? previewShop(shop) : enterShop(shop, product))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        if (wholesale || exchange) previewShop(shop);
                        else enterShop(shop, product);
                      }
                    }}
                    className="block w-full cursor-pointer text-left"
                  >
                    <div className="relative h-24 overflow-hidden md:h-32">
                      <img src={product.image || shop.image} alt="" className="h-full w-full object-cover transition duration-500 hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/58 via-black/4 to-transparent" />
                      <span className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/92 text-[#F5A623] shadow">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="absolute right-3 top-3 rounded-full bg-white/92 px-2 py-1 text-[11px] font-black text-slate-900">{shop.distance} - {shop.eta}</span>
                    </div>
                    <div className="p-3 md:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-black md:text-base">{product.name}</h3>
                          <p className={cn("mt-0.5 truncate text-xs md:mt-1 md:text-sm", dark ? "text-white/58" : "text-slate-500")}>{shop.name}</p>
                        </div>
                        <span className="shrink-0 text-xs font-black text-[#F5A623] md:text-sm">{formatMoney(product.priceCfa)}</span>
                      </div>
                      <p className={cn("mt-1 line-clamp-1 text-[11px] leading-relaxed md:mt-2 md:text-xs", dark ? "text-white/56" : "text-slate-600")}>{product.description}</p>
                      <div className="mt-2 flex items-center justify-between gap-3 md:mt-4">
                        <span className={cn("text-xs font-bold", dark ? "text-white/52" : "text-slate-500")}>{shop.category} - {shop.openLabel}</span>
                        <span className="rounded-full bg-[#F5A623]/16 px-2.5 py-1 text-[11px] font-black text-[#F5A623] md:px-3 md:py-1.5 md:text-xs">{wholesale ? "Quote" : exchange ? "Review seller" : "Ready"}</span>
                      </div>
                      {!wholesale && !exchange ? (
                        <div className="mt-2 grid grid-cols-[44px_minmax(0,1fr)] gap-2 md:mt-3">
                          <button type="button" onClick={(event) => { event.stopPropagation(); quickAddProduct(shop, product); }} className="grid h-10 place-items-center rounded-2xl border border-[#F5A623]/35 bg-[#F5A623]/14 text-[#F5A623] transition hover:bg-[#F5A623] hover:text-[#07111F]" aria-label={`Add ${product.name} to order`}>
                            <Plus className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); enterShop(shop, product); }} className={cn("flex h-9 items-center justify-center rounded-2xl border text-xs font-black md:h-10 md:text-sm", dark ? "border-white/14 text-white/74 hover:bg-white/8" : "border-slate-200 text-slate-700 hover:bg-slate-50")}>
                            Open products
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {showRightMap ? (
          <div className="h-56 overflow-hidden rounded-[26px] border border-slate-200 shadow-[0_16px_34px_rgba(15,23,42,.08)] lg:hidden">
            <LiveMapPane dark={dark} places={visiblePlaces} activeShop={activeShop} userLocation={userLocation} wholesale={wholesale} exchange={exchange} onSelect={selectPlaceFromMap} provider={placesStatus} mapsConfig={mapsConfig} className="h-full border-l-0" />
          </div>
        ) : null}

        <section>
          <h2 className="mb-3 text-xl font-black">{wholesale ? "Supplier map list" : exchange ? "Merchant trust list" : "Nearby shops"}</h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {visiblePlaces.slice(0, 8).map((shop) => {
              const visual = visualForCategory(shop.category, wholesale, exchange);
              const Icon = visual.Icon;
              return (
                <button key={shop.id} type="button" onClick={() => (wholesale || exchange ? previewShop(shop) : enterShop(shop))} className={cn("flex gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5", activeShop?.id === shop.id ? "border-[#F5A623]" : dark ? "border-white/10 bg-[#07111F]" : "border-slate-200 bg-white")}>
                  <img src={shop.image} alt="" className="h-20 w-24 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#F5A623]/16 text-[#F5A623]"><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <div className="truncate font-black">{shop.name}</div>
                        <div className={cn("truncate text-sm", dark ? "text-white/58" : "text-slate-500")}>{shop.category}</div>
                      </div>
                    </div>
                    <div className={cn("mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold", dark ? "text-white/58" : "text-slate-600")}>
                      <span>{shop.distance}</span>
                      <span>{shop.eta}</span>
                      <span>{shop.rating.toFixed(1)} ({shop.ratingCount})</span>
                      {shop.moq ? <span>{shop.moq}</span> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  ) : null;

  if (mapDominant) {
    return (
      <div className={cn("flex flex-col overflow-hidden", embeddedShell ? "h-full min-h-0 pt-[64px]" : "h-[100dvh] min-h-[100dvh]", dark ? "bg-[#05070B] text-white" : "bg-[#F7F8FA] text-slate-950")}>
        {!embeddedShell ? (
          <Header dark={dark} themeMode={themeMode} setThemeMode={setThemeMode} setSpace={openSpace} onNavigate={onNavigate} isAdmin={isAdmin} />
        ) : null}
        <div className={cn("grid min-h-0 flex-1 grid-cols-1", shellGridClass)}>
          {shopCenter || (
            <div className="relative min-h-0">
              <LiveMapPane dark={dark} places={visiblePlaces} activeShop={activeShop} userLocation={userLocation} wholesale={wholesale} exchange={exchange} onSelect={selectPlaceFromMap} provider={placesStatus} mapsConfig={mapsConfig} className="h-full" />
              {activeShop ? (
                <section className={cn("absolute bottom-5 left-5 right-5 z-[401] overflow-hidden rounded-[26px] border backdrop-blur-xl lg:right-auto lg:w-[430px]", dark ? "border-white/12 bg-[#07111F]/88 text-white shadow-[0_26px_80px_rgba(0,0,0,.45)]" : "border-white/90 bg-white/92 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,.18)]")}>
                  <div className="grid grid-cols-[116px_minmax(0,1fr)]">
                    <img src={activeShop.image} alt="" className="h-full min-h-[148px] w-full object-cover" />
                    <div className="min-w-0 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F5A623]">
                            {wholesale ? "Selected supplier" : exchange ? "Selected seller" : "Selected shop"}
                          </div>
                          <h2 className="mt-1 truncate text-xl font-black">{activeShop.name}</h2>
                          <p className={cn("mt-1 truncate text-sm font-semibold", dark ? "text-white/62" : "text-slate-600")}>{activeShop.category}</p>
                        </div>
                        <button type="button" onClick={() => setActiveShop(null)} className={cn("rounded-full border px-2.5 py-1 text-xs font-black", dark ? "border-white/12 text-white/70 hover:bg-white/8" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>Close</button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                        <span className="rounded-full bg-[#F5A623]/16 px-2.5 py-1 text-[#F5A623]">{activeShop.distance} - {activeShop.eta}</span>
                        <span className={cn("rounded-full px-2.5 py-1", dark ? "bg-white/[0.06] text-white/72" : "bg-slate-100 text-slate-700")}>Rating {activeShop.rating.toFixed(1)} ({activeShop.ratingCount})</span>
                        {activeShop.moq ? <span className={cn("rounded-full px-2.5 py-1", dark ? "bg-white/[0.06] text-white/72" : "bg-slate-100 text-slate-700")}>{activeShop.moq}</span> : null}
                        {activeShop.leadTime ? <span className={cn("rounded-full px-2.5 py-1", dark ? "bg-white/[0.06] text-white/72" : "bg-slate-100 text-slate-700")}>{activeShop.leadTime}</span> : null}
                      </div>
                      {!wholesale && !exchange ? (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {productsForShop(activeShop).slice(0, 3).map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => {
                                enterShop(activeShop, product);
                              }}
                              className={cn("overflow-hidden rounded-2xl border text-left", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white")}
                              aria-label={`Open ${product.name}`}
                            >
                              <img src={product.image} alt="" className="h-12 w-full object-cover" />
                              <div className="min-w-0 px-2 py-1.5">
                                <div className="truncate text-[11px] font-black">{product.name}</div>
                                <div className="truncate text-[10px] font-bold text-[#F5A623]">{formatMoney(product.priceCfa)}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {wholesale ? (
                          <>
                            <button type="button" onClick={() => handleAsk("Request a quote")} className="h-10 rounded-2xl bg-[#F5A623] text-sm font-black text-[#07111F]">Request quote</button>
                            <button type="button" onClick={() => setAssistantCollapsed(false)} className={cn("h-10 rounded-2xl border text-sm font-black", dark ? "border-white/14 text-white/74 hover:bg-white/8" : "border-slate-200 text-slate-700 hover:bg-slate-50")}>Supplier chat</button>
                          </>
                        ) : exchange ? (
                          <>
                            <button type="button" onClick={() => handleAsk("Review this seller")} className="h-10 rounded-2xl bg-[#F5A623] text-sm font-black text-[#07111F]">Review profile</button>
                            <button type="button" onClick={() => setAssistantCollapsed(false)} className={cn("h-10 rounded-2xl border text-sm font-black", dark ? "border-white/14 text-white/74 hover:bg-white/8" : "border-slate-200 text-slate-700 hover:bg-slate-50")}>Seller analyst</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => enterShop(activeShop)} className="h-10 rounded-2xl bg-[#F5A623] text-sm font-black text-[#07111F]">Open products</button>
                            <button type="button" onClick={() => quickAddProduct(activeShop, productsForShop(activeShop)[0])} className={cn("h-10 rounded-2xl border text-sm font-black", dark ? "border-white/14 text-white/74 hover:bg-white/8" : "border-slate-200 text-slate-700 hover:bg-slate-50")}>Add top product</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <section className={cn("absolute bottom-5 left-5 right-5 z-[401] overflow-hidden rounded-[26px] border backdrop-blur-xl lg:right-[380px] xl:right-[400px] 2xl:right-[420px]", dark ? "border-white/12 bg-[#07111F]/88 text-white shadow-[0_26px_80px_rgba(0,0,0,.45)]" : "border-white/90 bg-white/92 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,.18)]")}>
                  <div className="flex items-center justify-between gap-3 border-b border-current/10 px-4 py-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F5A623]">
                        {wholesale ? "Supplier map" : exchange ? "Export seller map" : "Products on this map"}
                      </div>
                      <div className="mt-0.5 text-sm font-black">
                        {wholesale ? "Tap a supplier for MOQ and quote flow" : exchange ? "Tap a seller for products, owner, and proof" : "Tap a product or marker to enter the shop"}
                      </div>
                    </div>
                    <MapPin className="h-5 w-5 shrink-0 text-[#F5A623]" />
                  </div>
                  <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
                    {mapShelfProducts.map(({ shop, product }) => (
                      <button
                        key={`${shop.id}-${product.id}-map-shelf`}
                        type="button"
                        onClick={() => (wholesale || exchange ? previewShop(shop) : enterShop(shop, product))}
                        className={cn("grid grid-cols-[62px_minmax(0,1fr)] items-center gap-2 rounded-2xl border p-2 text-left transition hover:-translate-y-0.5", dark ? "border-white/10 bg-white/[0.04] hover:border-[#F5A623]/50" : "border-slate-200 bg-white hover:border-[#F5A623]/50")}
                      >
                        <img src={product.image || shop.image} alt="" className="h-14 w-14 rounded-xl object-cover" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-black">{product.name}</span>
                          <span className={cn("mt-0.5 block truncate text-[11px] font-semibold", dark ? "text-white/58" : "text-slate-600")}>{shop.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] font-black text-[#F5A623]">{formatMoney(product.priceCfa)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
          {assistantPane}
        </div>
        {!shopMode ? (
          <>
            {mobileComposer}
            {mobileBottomNav}
          </>
        ) : mobileShopOrderBar}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col overflow-hidden", embeddedShell ? "h-full min-h-0 pt-[64px]" : "h-[100dvh] min-h-[100dvh]", dark ? "bg-[#05070B] text-white" : "bg-[#F7F8FA] text-slate-950")}>
      {!embeddedShell ? (
        <Header dark={dark} themeMode={themeMode} setThemeMode={setThemeMode} setSpace={openSpace} onNavigate={onNavigate} isAdmin={isAdmin} />
      ) : null}
      <div
        className={cn("grid min-h-0 flex-1 grid-cols-1", shellGridClass)}
      >
        {shopCenter || businessCenter || discoveryCenter}
        {showRightMap ? (
          <LiveMapPane dark={dark} places={visiblePlaces} activeShop={activeShop} userLocation={userLocation} wholesale={wholesale} exchange={exchange} onSelect={selectPlaceFromMap} provider={placesStatus} mapsConfig={mapsConfig} className="hidden lg:block" />
        ) : null}
        {assistantPane}
      </div>
      {!shopMode ? (
        <>
          {mobileComposer}
          {mobileBottomNav}
        </>
      ) : mobileShopOrderBar}
      {videoOpen ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className={cn("w-full max-w-2xl overflow-hidden rounded-2xl border", dark ? "border-white/12 bg-[#07111F] text-white" : "border-white bg-white text-slate-950")}>
            <div className="flex items-center justify-between border-b border-current/10 px-4 py-3">
              <div>
                <div className="text-lg font-black">Live product preview</div>
                <div className="text-sm text-current/60">This call is live and not recorded.</div>
              </div>
              <button type="button" onClick={() => setVideoOpen(false)} className="rounded-md border border-current/15 px-3 py-2 text-sm font-semibold">Close</button>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-[1fr_220px]">
              <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-950 text-white">
                <div className="text-center">
                  <MessageCircle className="mx-auto h-10 w-10 text-[#F5A623]" />
                  <p className="mt-3 text-sm">The shop can show the product live when the Front Desk accepts.</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-current/10 p-3">
                  <div className="font-black">{activeShop?.name || "Nearby shop"}</div>
                  <div className="text-sm text-current/55">{activeShop ? `${activeShop.distance} - ${activeShop.eta}` : "Choose a shop first"}</div>
                </div>
                <button type="button" onClick={() => setVideoOpen(false)} className="w-full rounded-md bg-[#F5A623] px-3 py-2 text-sm font-black text-black">Return</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Header({
  dark,
  themeMode,
  setThemeMode,
  setSpace,
  onNavigate,
  isAdmin,
}: {
  dark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  setSpace: (space: ConversationSpace) => void;
  onNavigate?: (href: string) => void;
  isAdmin: boolean;
}) {
  const nav: Array<[string, ConversationSpace, LucideIcon]> = [
    ["Retail", "city", Store],
    ["Map", "city", MapIcon],
    ["Wholesale", "wholesale", Warehouse],
    ["Ready for export", "exchange", BriefcaseBusiness],
    ["My Business", "business", BriefcaseBusiness],
  ];
  return (
    <header className={cn("z-40 flex h-[74px] shrink-0 items-center gap-4 border-b px-4 shadow-[0_18px_50px_rgba(5,7,11,.16)] lg:px-6", dark ? "border-white/10 bg-[#05070B] text-white" : "border-slate-200 bg-[#F7F8FA] text-slate-900")}>
      <button type="button" onClick={() => setSpace("city")} className="flex min-w-[210px] items-center gap-3" aria-label="Exportunity marketplace">
        <img src="/tenants/exportunity/logo.svg" alt="Exportunity AI" className="h-11 w-auto max-w-[220px]" />
      </button>
      <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
        {nav.map(([label, space, Icon]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (label === "Map") {
                setSpace("city");
                onNavigate?.("/map");
                return;
              }
              if (label === "Ready for export") {
                setSpace("exchange");
                onNavigate?.("/ready-for-export");
                return;
              }
              setSpace(space);
            }}
            className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition", dark ? "text-white/68 hover:bg-white/8 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className={cn("hidden h-11 items-center gap-2 rounded-full border border-current/20 bg-transparent px-4 text-sm font-semibold md:inline-flex", dark ? "text-white/68" : "text-slate-700")}>
          <MapPin className="h-4 w-4" /> Cocody, Abidjan <ChevronDown className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")} className={cn("grid h-11 w-11 place-items-center rounded-full border", dark ? "border-white/12 bg-white/5 text-[#F5A623]" : "border-slate-300 bg-slate-100 text-slate-800")} aria-label="Toggle theme">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        {isAdmin ? <span className="hidden rounded-full bg-[#F5A623] px-2 py-1 text-xs font-black text-black md:inline-flex">Admin</span> : null}
      </div>
    </header>
  );
}

export default ExportunityNeighbourhoodCommerce;
