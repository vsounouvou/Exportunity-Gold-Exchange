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
const exchangeQuickReplies = ["Verified SMEs", "Ready for export", "Food businesses", "Women-led shops", "Revenue signals", "Compliance review"];
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
      image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
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

function visualForCategory(category: string, wholesale: boolean, exchange: boolean): { label: string; marker: string; Icon: LucideIcon } {
  const value = category.toLowerCase();
  if (exchange) return { label: "PME", marker: "PME", Icon: BriefcaseBusiness };
  if (value.includes("bakery") || value.includes("bread")) return { label: "Bakery", marker: "BR", Icon: Store };
  if (value.includes("coffee") || value.includes("cafe")) return { label: "Coffee", marker: "CF", Icon: Coffee };
  if (value.includes("restaurant")) return { label: "Food", marker: "FD", Icon: Utensils };
  if (value.includes("organic") || value.includes("grocery") || value.includes("food")) return { label: "Groceries", marker: "GR", Icon: Leaf };
  if (value.includes("pharmacy")) return { label: "Pharmacy", marker: "RX", Icon: Pill };
  if (value.includes("fashion") || value.includes("textile")) return { label: "Fashion", marker: "ST", Icon: Shirt };
  if (value.includes("gift")) return { label: "Gifts", marker: "GF", Icon: Gift };
  if (value.includes("hardware") || value.includes("building") || value.includes("construction")) return { label: "Materials", marker: "MT", Icon: Hammer };
  if (value.includes("machinery") || value.includes("industrial")) return { label: "Industry", marker: "IN", Icon: Factory };
  if (value.includes("logistics") || value.includes("warehouse")) return { label: "Logistics", marker: "LG", Icon: Truck };
  if (value.includes("packaging")) return { label: "Packaging", marker: "PK", Icon: Package };
  return wholesale ? { label: "Supplier", marker: "WH", Icon: Warehouse } : { label: "Shop", marker: "SH", Icon: Store };
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
      <button type="button" aria-label="${shop.name}" style="position:relative;display:grid;place-items:center;width:${active ? 64 : 48}px;height:${active ? 64 : 48}px;border-radius:22px;border:2px solid ${active ? "#F5A623" : "rgba(255,255,255,.95)"};background:${tone};color:white;box-shadow:0 0 0 ${active ? 10 : 5}px rgba(245,166,35,.16),0 18px 34px rgba(0,0,0,.24);font-family:Inter,system-ui,sans-serif;font-size:${exchange ? 12 : 14}px;font-weight:950;">
        ${visual.marker}
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

function MapFocus({ userLocation, activeShop, visiblePlaces }: { userLocation: [number, number]; activeShop: CommerceShop | null; visiblePlaces: CommerceShop[] }) {
  const map = useMap();
  useEffect(() => {
    if (activeShop) {
      map.flyTo(activeShop.position, 15, { duration: 0.85, easeLinearity: 0.18 });
      return;
    }
    const bounds = L.latLngBounds([userLocation, ...visiblePlaces.map((shop) => shop.position)]);
    map.flyToBounds(bounds, { padding: [42, 42], maxZoom: 13, duration: 0.85, easeLinearity: 0.18 });
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

function CategoryTile({ label, Icon, dark, onClick }: { label: string; Icon: LucideIcon; dark: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-w-[118px] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition hover:-translate-y-0.5",
        dark ? "border-white/10 bg-white/[0.045] text-white hover:border-[#F5A623]/50" : "border-slate-200 bg-white text-slate-900 hover:border-[#F5A623]/55 hover:shadow-[0_16px_34px_rgba(15,23,42,.09)]",
      )}
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#F5A623]/16 text-[#F5A623] transition group-hover:bg-[#F5A623] group-hover:text-[#07111F]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-black">{label}</span>
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
}) {
  const routePoints = activeShop ? [userLocation, activeShop.position] : [userLocation, places[0]?.position || userLocation];
  return (
    <section className={cn("relative overflow-hidden rounded-none border-l", dark ? "border-white/10 bg-[#07111F]" : "border-slate-200 bg-white", className)}>
      <MapContainer center={userLocation} zoom={13} className="h-full min-h-[320px] w-full" zoomControl={false}>
        <TileLayer
          key={dark ? "dark" : "light"}
          attribution="&copy; OpenStreetMap &copy; CARTO"
          url={dark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
        />
        <MapFocus userLocation={userLocation} activeShop={activeShop} visiblePlaces={places} />
        <Polyline positions={routePoints} pathOptions={{ color: "#F5A623", weight: 7, opacity: 0.18 }} />
        <Polyline positions={routePoints} pathOptions={{ color: "#F5A623", weight: 3, opacity: 0.85, dashArray: "14 14" }} />
        <Marker position={userLocation} icon={makeUserIcon()} />
        {places.map((shop) => {
          const active = activeShop?.id === shop.id;
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,transparent_0,transparent_42%,rgba(245,166,35,.06)_70%,rgba(7,17,31,.16)_100%)]" />
      <div className={cn("absolute left-4 right-4 top-4 rounded-2xl border p-3 backdrop-blur-xl", dark ? "border-white/12 bg-[#07111F]/78 text-white" : "border-white/90 bg-white/88 text-slate-950 shadow-[0_16px_36px_rgba(15,23,42,.12)]")}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#F5A623]">{exchange ? "Bourse de PME" : wholesale ? "Wholesale map" : "Neighbourhood map"}</div>
            <div className="mt-1 text-sm font-black">{places.length} live locations around Cocody</div>
          </div>
          <Navigation className="h-5 w-5 text-[#F5A623]" />
        </div>
        <div className={cn("mt-2 text-xs font-semibold", dark ? "text-white/60" : "text-slate-600")}>{provider.label}</div>
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
  const [userLocation, setUserLocation] = useState<[number, number]>(ABIDJAN_COCODY);
  const [input, setInput] = useState("");
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "unavailable">("idle");
  const [messages, setMessages] = useState<ConversationMessage[]>([
    { id: "hello", agentId: "tassi", content: "Hello, I'm Tassi. What are you looking for around you today?", createdAt: "now", agentSnapshot: tassi },
    { id: "options", agentId: "tassi", content: "You can start with breakfast, fresh bread, coffee, building materials, delivery, or wholesale suppliers.", createdAt: "now", agentSnapshot: tassi },
  ]);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, Record<string, OrderLine>>>({});
  const [placesStatus, setPlacesStatus] = useState<PublicPlacesState>({
    provider: "curated",
    label: "Curated Abidjan data",
    detail: "Google Places can replace or enrich this when configured.",
  });
  const [videoOpen, setVideoOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        merchantStory: `${shop.name} supplies SMEs and can be reviewed for structured commercial opportunities after verification.`,
      })),
    ],
    [retailShops, wholesaleShops],
  );

  const placePool = exchange ? exchangeShops : wholesale ? wholesaleShops : retailShops;
  const visiblePlaces = useMemo(() => placePool.slice(0, mapDominant ? 18 : wholesale || exchange ? 12 : 10), [exchange, mapDominant, placePool, wholesale]);
  const selectedProducts = useMemo(() => (activeShop ? productsForShop(activeShop) : []), [activeShop]);
  const activeShopImage = activeShop ? selectedProducts[0]?.image || activeShop.image : undefined;
  const heroImage = activeShopImage || (visiblePlaces[0] ? productsForShop(visiblePlaces[0])[0]?.image || visiblePlaces[0].image : undefined);
  const orderDraft = activeShop ? orderDrafts[activeShop.id] || {} : {};
  const orderLines = Object.values(orderDraft);
  const subtotal = orderLines.reduce((sum, line) => sum + line.product.priceCfa * line.quantity, 0);
  const visibleAgent = shopMode && activeShop ? activeShop.frontDesk : business ? businessAgents[0] : wholesale ? supplierAgent : tassi;
  const quickReplies = shopMode ? shopQuickReplies : business ? businessQuickReplies : exchange ? exchangeQuickReplies : wholesale ? wholesaleQuickReplies : cityQuickReplies;
  const showRightMap = !shopMode && !business;

  useEffect(() => {
    window.localStorage.setItem("exportunity-map-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    setSpace(initialSpace);
    setActiveShop(null);
  }, [initialSpace]);

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
            label: "Google Places connected",
            detail: "Live public business listings are available.",
            lastSyncTime: body.lastSyncTime,
          });
        } else {
          setPlacesStatus({
            provider: "curated",
            label: "Curated Abidjan data",
            detail: body?.message || "Google Places is not configured yet. Seeded city data is active.",
          });
        }
      } catch {
        if (!cancelled) {
          setPlacesStatus({
            provider: "curated",
            label: "Curated Abidjan data",
            detail: "Google Places endpoint is not available in this build. Seeded city data is active.",
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
    const pageLabel = shopMode && activeShop ? `${activeShop.name} shop` : business ? "My Business" : exchange ? "Bourse de PME" : wholesale ? "Wholesale" : "Explore";
    window.dispatchEvent(
      new CustomEvent("chairman-dock:context", {
        detail: {
          pageKey: shopMode && activeShop ? `shop:${activeShop.id}` : business ? "exportunity-business" : exchange ? "exportunity-pme-exchange" : wholesale ? "exportunity-wholesale" : "exportunity-marketplace",
          pageLabel,
          managerName: visibleAgent.name,
          managerRole: visibleAgent.role,
        },
      }),
    );
  }, [activeShop, business, exchange, shopMode, visibleAgent.name, visibleAgent.role, wholesale]);

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
    if (nextSpace === "wholesale") onNavigate?.("/wholesale");
    if (nextSpace === "exchange") onNavigate?.("/pme-exchange");
    if (nextSpace === "city") onNavigate?.("/marketplace");
  };

  const previewShop = (shop: CommerceShop) => {
    setActiveShop(shop);
    if (space === "shop") setSpace(wholesale ? "wholesale" : exchange ? "exchange" : "city");
  };

  const enterShop = (shop: CommerceShop) => {
    setActiveShop(shop);
    setSpace("shop");
    if (!orderDrafts[shop.id]) {
      setOrderDrafts((current) => ({ ...current, [shop.id]: current[shop.id] || {} }));
    }
    pushMessage({
      agentId: shop.frontDesk.id,
      agentSnapshot: shop.frontDesk,
      shopId: shop.id,
      content: `Welcome to ${shop.name}. I'm ${shop.frontDesk.name}, the shop Front Desk. Products are ready here; select what you want and I will help with availability, payment, and delivery.`,
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
    pushMessage({ agentId: "user", content: text, shopId: shopMode && activeShop ? activeShop.id : undefined });

    if (shopMode && activeShop) {
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
      replyFrom(tassi, "I switched to Bourse de PME. These are commercial profiles with trust and verification status; investment remains internal-review and compliance-gated.");
      return;
    }

    const target = lower.includes("coffee")
      ? retailShops.find((shop) => shop.category.toLowerCase().includes("cafe") || shop.category.toLowerCase().includes("coffee"))
      : lower.includes("material") || lower.includes("building")
        ? retailShops.find((shop) => /hardware|building/i.test(shop.category))
        : retailShops[0];
    if (target) setActiveShop(target);
    replyFrom(tassi, "I found nearby products and shops. Pick a product in the center, or tap a shop to preview and enter it.");
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

  const conversationMessages = shopMode && activeShop
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
  const categoryTiles = exchange
    ? [
        ["Verified SMEs", BriefcaseBusiness],
        ["Food", Utensils],
        ["Fashion", Shirt],
        ["Revenue signals", FileText],
        ["Export-ready", Package],
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

  const assistantPane = (
    <aside className={cn("flex min-h-0 flex-col border-r", dark ? "border-white/10 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950")}>
      <div className="border-b border-current/10 p-4">
        <div className="flex items-center gap-3">
          <AgentAvatar agent={visibleAgent} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-lg font-black">{visibleAgent.name}</div>
            <div className={cn("text-xs font-bold", dark ? "text-white/58" : "text-slate-500")}>
              {shopMode ? `${visibleAgent.role} for ${activeShop?.name}` : business ? "Business operating agent" : wholesale ? "Wholesale sourcing agent" : exchange ? "PME scout" : "Concierge"}
            </div>
          </div>
          <span className="ml-auto rounded-full bg-emerald-500/12 px-2 py-1 text-[11px] font-black text-emerald-600">Online</span>
        </div>
        <div className={cn("mt-4 rounded-2xl border p-3 text-sm leading-relaxed", dark ? "border-white/10 bg-white/[0.045] text-white/76" : "border-slate-200 bg-slate-50 text-slate-650")}>
          {shopMode && activeShop
            ? `${visibleAgent.name} is guiding this shop. Pick products in the center and use chat only when you need help.`
            : business
              ? "Run the business by talking to your agents. They report issues, create actions, and coordinate the shop."
              : wholesale
                ? "Find suppliers, request quotes, and keep outreach approval-gated."
                : exchange
                  ? "Discover verified PME profiles. Investment stays hidden until compliance approval."
                  : "Use Tassi to search faster. Products and shops stay in the center so buying remains clear."}
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
          className={cn("flex items-center gap-2 rounded-3xl border-2 p-2", dark ? "border-[#F5A623]/34 bg-[#05070B]" : "border-[#F5A623]/55 bg-white")}
        >
          <button type="button" onClick={() => fileInputRef.current?.click()} className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Attach file">
            <Paperclip className="h-5 w-5" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handlePhoto(event.target.files?.[0])} />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={shopMode ? `Message ${visibleAgent.name}...` : "Ask Tassi anything around you..."}
            className={cn("min-w-0 flex-1 bg-transparent px-1 text-sm font-semibold outline-none placeholder:text-current/46", dark ? "text-white" : "text-slate-950")}
          />
          <button type="button" onClick={startVoice} className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", voiceState === "listening" ? "bg-red-500 text-white" : dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Tap to speak">
            {voiceState === "listening" ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", dark ? "text-white hover:bg-white/10" : "text-slate-700 hover:bg-slate-100")} aria-label="Photo search">
            <Camera className="h-5 w-5" />
          </button>
          <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F5A623] text-[#07111F]" aria-label={`Send to ${visibleAgent.name}`}>
            <Send className="h-5 w-5" />
          </button>
        </form>
        {voiceState === "listening" || voiceState === "unavailable" ? (
          <div className={cn("mt-2 text-xs font-bold", voiceState === "listening" ? "text-red-500" : dark ? "text-white/58" : "text-slate-500")}>{voiceState === "listening" ? "Listening..." : "Voice is unavailable in this browser."}</div>
        ) : null}
      </div>
    </aside>
  );

  const shopCenter = shopMode && activeShop ? (
    <main className={cn("min-h-0 overflow-auto", dark ? "bg-[#05070B]" : "bg-[#F7F8FA]")}>
      <div className="p-4 md:p-6">
        <button type="button" onClick={() => setSpace(wholesale ? "wholesale" : exchange ? "exchange" : "city")} className={cn("mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black", dark ? "border-white/12 text-white/72 hover:bg-white/8" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
          <ArrowLeft className="h-4 w-4" /> Back to discovery
        </button>
        <section className={cn("overflow-hidden rounded-[28px] border", dark ? "border-white/12 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,.08)]")}>
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_310px]">
            <div className="min-w-0">
              <div className="relative h-56 overflow-hidden">
                <img src={activeShopImage || activeShop.image} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <div className="mb-3 inline-flex rounded-full bg-[#F5A623] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#07111F]">Inside shop</div>
                  <h1 className="text-3xl font-black">{activeShop.name}</h1>
                  <p className="mt-1 text-sm font-semibold text-white/78">{activeShop.category} - {activeShop.openLabel} - {activeShop.distance} - {activeShop.eta}</p>
                </div>
              </div>
              <div className="p-5">
                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  <div>
                    <h2 className="text-xl font-black">Products available now</h2>
                    <p className={cn("mt-1 text-sm", dark ? "text-white/62" : "text-slate-600")}>
                      Pick quantities first. {activeShop.frontDesk.name} is available for questions, substitutions, payment, and delivery.
                    </p>
                  </div>
                  <div className={cn("rounded-2xl border p-3", dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50")}>
                    <div className="flex items-center gap-3">
                      <AgentAvatar agent={activeShop.frontDesk} />
                      <div>
                        <div className="text-sm font-black">{activeShop.frontDesk.name}</div>
                        <div className={cn("text-xs font-bold", dark ? "text-white/55" : "text-slate-500")}>Shop Front Desk</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {selectedProducts.map((product) => {
                    const quantity = orderDraft[product.id]?.quantity || 0;
                    return (
                      <article key={product.id} className={cn("overflow-hidden rounded-2xl border", dark ? "border-white/12 bg-white/[0.04]" : "border-slate-200 bg-white")}>
                        <img src={product.image} alt={product.name} className="h-36 w-full object-cover" />
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-base font-black">{product.name}</h3>
                              <p className={cn("mt-1 line-clamp-2 text-xs leading-relaxed", dark ? "text-white/58" : "text-slate-600")}>{product.description}</p>
                            </div>
                            <span className="shrink-0 text-sm font-black text-[#F5A623]">{formatMoney(product.priceCfa)}</span>
                          </div>
                          <div className={cn("mt-3 flex items-center justify-between text-xs", dark ? "text-white/55" : "text-slate-500")}>
                            <span>{product.unit}</span>
                            <span>{product.quantityAvailable} available</span>
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => updateQuantity(activeShop, product, quantity - 1)} className={cn("grid h-9 w-9 place-items-center rounded-xl border", dark ? "border-white/20 hover:bg-white/10" : "border-slate-300 hover:bg-slate-100")} aria-label={`Reduce ${product.name}`}>
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-9 text-center text-sm font-black">{quantity}</span>
                              <button type="button" onClick={() => updateQuantity(activeShop, product, quantity + 1)} className={cn("grid h-9 w-9 place-items-center rounded-xl border", dark ? "border-white/20 hover:bg-white/10" : "border-slate-300 hover:bg-slate-100")} aria-label={`Add ${product.name}`}>
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
              </div>
            </div>
            <aside className={cn("border-t p-5 xl:border-l xl:border-t-0", dark ? "border-white/10 bg-[#05070B]/42" : "border-slate-200 bg-slate-50/86")}>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#F5A623]">Your order</div>
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
                  <div className={cn("rounded-xl border px-3 py-4 text-sm font-semibold", dark ? "border-white/10 bg-white/[0.04] text-white/58" : "border-slate-200 bg-white text-slate-500")}>Select products to start.</div>
                )}
              </div>
              <div className="mt-4 border-t pt-4" style={{ borderColor: dark ? "rgba(255,255,255,.14)" : "rgba(15,23,42,.12)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span className={dark ? "text-white/62" : "text-slate-600"}>Subtotal</span>
                  <span className="font-black">{formatMoney(subtotal)}</span>
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
      </div>
    </main>
  ) : null;

  const businessCenter = business ? (
    <main className={cn("min-h-0 overflow-auto p-4 md:p-6", dark ? "bg-[#05070B]" : "bg-[#F7F8FA]")}>
      <section className={cn("rounded-[28px] border p-5", dark ? "border-white/12 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,.08)]")}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#F5A623]">My Business</div>
            <h1 className="mt-2 text-3xl font-black">Agent operating room</h1>
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
    <main className={cn("min-h-0 overflow-auto", dark ? "bg-[#05070B]" : "bg-[#F7F8FA]")}>
      <div className="space-y-5 p-4 md:p-6">
        <section className={cn("overflow-hidden rounded-[30px] border", dark ? "border-white/12 bg-[#07111F] text-white" : "border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,.08)]")}>
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#F5A623] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#07111F]">
                  {exchange ? "Bourse de PME" : wholesale ? "Wholesale" : "Retail marketplace"}
                </span>
                <span className={cn("rounded-full border px-3 py-1 text-[11px] font-black", dark ? "border-white/12 text-white/62" : "border-slate-200 text-slate-600")}>Cocody, Abidjan</span>
                {isAdmin ? <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-[11px] font-black text-emerald-600">Admin view</span> : null}
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-tight md:text-5xl">
                {exchange ? "Discover verified PME stories before investment." : wholesale ? "Find suppliers, stock, MOQ, and routes." : "Buy nearby products from real local shops."}
              </h1>
              <p className={cn("mt-3 max-w-2xl text-base leading-relaxed", dark ? "text-white/64" : "text-slate-600")}>
                {exchange
                  ? "Profiles show people, place, proof, products, and compliance status. Public investment remains gated."
                  : wholesale
                    ? "Supplier discovery is quote-first and outreach is controlled by approval, audit logs, and opt-out rules."
                    : "Products are central. The map shows where they are, while Tassi and shop agents help only when needed."}
              </p>
            </div>
            <div className="relative hidden min-h-[240px] overflow-hidden xl:block">
              <img src={heroImage} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#F5A623]">Selected</div>
                <div className="mt-1 text-xl font-black">{activeShop?.name || visiblePlaces[0]?.name}</div>
                <div className="text-sm text-white/72">{activeShop?.distance || visiblePlaces[0]?.distance} - {activeShop?.eta || visiblePlaces[0]?.eta}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {categoryTiles.map(([label, Icon]) => (
            <CategoryTile key={String(label)} label={String(label)} Icon={Icon as LucideIcon} dark={dark} onClick={() => handleQuickReply(String(label))} />
          ))}
        </div>

        {activeShop ? (
          <section className={cn("rounded-[26px] border p-4", dark ? "border-[#F5A623]/24 bg-[#F5A623]/10 text-white" : "border-[#F5A623]/35 bg-[#F5A623]/10 text-slate-950")}>
            <div className="grid gap-4 lg:grid-cols-[170px_minmax(0,1fr)_220px] lg:items-center">
              <img src={activeShopImage || activeShop.image} alt="" className="h-32 w-full rounded-2xl object-cover lg:h-28" />
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#F5A623]">Quick peek</div>
                <h2 className="mt-1 truncate text-2xl font-black">{activeShop.name}</h2>
                <p className={cn("mt-1 text-sm font-semibold", dark ? "text-white/62" : "text-slate-600")}>
                  {activeShop.category} - Rating {activeShop.rating.toFixed(1)} - {activeShop.distance} - {activeShop.eta}
                </p>
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
                  <button type="button" onClick={() => handleAsk("Review this PME")} className="flex-1 rounded-2xl bg-[#F5A623] px-4 py-3 text-sm font-black text-[#07111F]">Review profile</button>
                ) : (
                  <button type="button" onClick={() => enterShop(activeShop)} className="flex-1 rounded-2xl bg-[#F5A623] px-4 py-3 text-sm font-black text-[#07111F]">Enter shop</button>
                )}
                <button type="button" onClick={() => setActiveShop(null)} className={cn("rounded-2xl border px-4 py-3 text-sm font-black", dark ? "border-white/14 text-white/72" : "border-slate-200 bg-white text-slate-700")}>Close</button>
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">{wholesale ? "Supplier offers" : exchange ? "PME profiles" : "Products near you"}</h2>
              <p className={cn("text-sm", dark ? "text-white/56" : "text-slate-600")}>
                {wholesale ? "Quote-ready suppliers with MOQ and lead time." : exchange ? "People, place, proof, and compliance status before any finance." : "Start with products, then enter the shop when you are ready."}
              </p>
            </div>
            <button type="button" onClick={() => onNavigate?.("/map")} className={cn("hidden items-center gap-2 rounded-full border px-4 py-2 text-sm font-black md:inline-flex", dark ? "border-white/12 text-white/72" : "border-slate-200 bg-white text-slate-700")}>
              <MapIcon className="h-4 w-4" /> Open map
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {commerceProducts.map(({ shop, product }) => {
              const visual = visualForCategory(shop.category, wholesale, exchange);
              const Icon = visual.Icon;
              return (
                <article key={`${shop.id}-${product.id}`} className={cn("overflow-hidden rounded-2xl border transition hover:-translate-y-0.5", dark ? "border-white/12 bg-[#07111F] hover:border-[#F5A623]/45" : "border-slate-200 bg-white hover:border-[#F5A623]/45 hover:shadow-[0_18px_44px_rgba(15,23,42,.09)]")}>
                  <button type="button" onClick={() => previewShop(shop)} className="block w-full text-left">
                    <div className="relative h-36 overflow-hidden">
                      <img src={product.image || shop.image} alt="" className="h-full w-full object-cover transition duration-500 hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/58 via-black/4 to-transparent" />
                      <span className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/92 text-[#F5A623] shadow">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="absolute right-3 top-3 rounded-full bg-white/92 px-2 py-1 text-[11px] font-black text-slate-900">{shop.distance} - {shop.eta}</span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-black">{product.name}</h3>
                          <p className={cn("mt-1 truncate text-sm", dark ? "text-white/58" : "text-slate-500")}>{shop.name}</p>
                        </div>
                        <span className="shrink-0 text-sm font-black text-[#F5A623]">{formatMoney(product.priceCfa)}</span>
                      </div>
                      <p className={cn("mt-2 line-clamp-2 text-xs leading-relaxed", dark ? "text-white/56" : "text-slate-600")}>{product.description}</p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className={cn("text-xs font-bold", dark ? "text-white/52" : "text-slate-500")}>{shop.category} - {shop.openLabel}</span>
                        <span className="rounded-full bg-[#F5A623] px-3 py-1.5 text-xs font-black text-[#07111F]">{wholesale ? "Quote" : exchange ? "Review" : "View"}</span>
                      </div>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-black">{wholesale ? "Supplier map list" : exchange ? "Merchant trust list" : "Nearby shops"}</h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {visiblePlaces.slice(0, 8).map((shop) => {
              const visual = visualForCategory(shop.category, wholesale, exchange);
              const Icon = visual.Icon;
              return (
                <button key={shop.id} type="button" onClick={() => previewShop(shop)} className={cn("flex gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5", activeShop?.id === shop.id ? "border-[#F5A623]" : dark ? "border-white/10 bg-[#07111F]" : "border-slate-200 bg-white")}>
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
          <Header dark={dark} themeMode={themeMode} setThemeMode={setThemeMode} setSpace={openSpace} isAdmin={isAdmin} />
        ) : null}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          {assistantPane}
          <LiveMapPane dark={dark} places={visiblePlaces} activeShop={activeShop} userLocation={userLocation} wholesale={wholesale} exchange={exchange} onSelect={previewShop} provider={placesStatus} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col overflow-hidden", embeddedShell ? "h-full min-h-0 pt-[64px]" : "h-[100dvh] min-h-[100dvh]", dark ? "bg-[#05070B] text-white" : "bg-[#F7F8FA] text-slate-950")}>
      {!embeddedShell ? (
        <Header dark={dark} themeMode={themeMode} setThemeMode={setThemeMode} setSpace={openSpace} isAdmin={isAdmin} />
      ) : null}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1",
          showRightMap
            ? "lg:grid-cols-[340px_minmax(0,1fr)_320px] xl:grid-cols-[360px_minmax(0,1fr)_360px]"
            : "lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]",
        )}
      >
        {assistantPane}
        {shopCenter || businessCenter || discoveryCenter}
        {showRightMap ? (
          <LiveMapPane dark={dark} places={visiblePlaces} activeShop={activeShop} userLocation={userLocation} wholesale={wholesale} exchange={exchange} onSelect={previewShop} provider={placesStatus} className="hidden lg:block" />
        ) : null}
      </div>
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
  isAdmin,
}: {
  dark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  setSpace: (space: ConversationSpace) => void;
  isAdmin: boolean;
}) {
  const nav: Array<[string, ConversationSpace, LucideIcon]> = [
    ["Explore", "city", Store],
    ["Map", "city", MapIcon],
    ["Wholesale", "wholesale", Warehouse],
    ["Ready export", "exchange", BriefcaseBusiness],
    ["My Business", "business", BriefcaseBusiness],
  ];
  return (
    <header className={cn("z-40 flex h-[74px] shrink-0 items-center gap-4 border-b px-4 shadow-[0_18px_50px_rgba(5,7,11,.16)] lg:px-6", dark ? "border-white/10 bg-[#05070B] text-white" : "border-slate-200 bg-[#F7F8FA] text-slate-900")}>
      <button type="button" onClick={() => setSpace("city")} className="flex min-w-[210px] items-center gap-3" aria-label="Exportunity marketplace">
        <img src="/tenants/exportunity/logo.svg" alt="Exportunity AI" className="h-11 w-auto max-w-[220px]" />
      </button>
      <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
        {nav.map(([label, space, Icon]) => (
          <button key={label} type="button" onClick={() => setSpace(space)} className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition", dark ? "text-white/68 hover:bg-white/8 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
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
