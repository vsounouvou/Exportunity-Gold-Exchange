import { Fragment, useState, useEffect, useRef, useCallback, useMemo, type WheelEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getDemoModeHeaders, isDemoModeEnabled } from "@/lib/demoMode";
import { MARKETPLACE_REFRESH_EVENT, MARKETPLACE_REFRESH_STORAGE_KEY } from "@/lib/marketplaceRefresh";
	import { resolveApiUrl } from "@/lib/runtimeConfig";
	import { absolutizePublicUrl } from "@/lib/assets";
import { getCategoryVisual, getRetailLabel, getTenantIdentity, getTenantPlaceholderProductImage } from "@/lib/storefrontIdentity";
	import { useSession } from "@/lib/session";
	import { useTenant } from "@/lib/tenant";
import { getTenantConfigByKey, hasTenantModule, type TenantStorefrontHero } from "../../../tenants/index";
	import { WalletDepositModal } from "@/components/payments/WalletDepositModal";
	import { BrandLockup } from "@pkg/branding";
	import { formatPageTitle } from "@/lib/brand";
	import { ChatFormWizard, type ChatWizardStep } from "@/components/ChatFormWizard";
	import { CountryCombobox } from "@/components/CountryCombobox";
import {
  MACHINERY_ITEMS,
  DEFAULT_COUNTRY,
  MiningModuleMode,
  MachineryFilters,
  InvestmentFilters,
  MachineryItem,
  InvestmentOpportunity,
  CadastrePermit,
  filterMachinery,
  filterOpportunities,
  formatMachineryCategory,
  formatMachineryCondition,
  formatMachineryStatus,
  formatSellerType,
  getCadastrePermitForMine,
  getCadastreSourceForCountry,
  getMineById,
  isCadastreCountryAvailable,
  isCadastrePermitValid,
  isMineCadastreVerified,
} from "@/lib/miningModules";
import { getCadastreRiskColor, getCadastreStatusColor, getCadastreTypeColor } from "@/ui/cadastre/colors";
import {
  Send,
  Loader2,
  MapPin,
  ArrowLeft,
  User,
  Store,
  Star,
  Heart,
  X,
  ShoppingCart,
  Package,
  Truck,
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Minus,
  Wallet,
  Sparkles,
  LogIn,
  LogOut,
  Settings,
  ClipboardList,
  UserCircle,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Activity,
  Wrench,
  BriefcaseBusiness,
  ShieldCheck,
  MoreVertical,
} from "lucide-react";

import { SendMoney } from "@/components/marketplace/SendMoney";
import { MobileBottomNav } from "@/components/marketplace/MobileBottomNav";
import { useLocale, type Currency, type Language, languageNames, currencyNames } from "@/contexts/LocaleContext";
import {
  getCachedLocation as getCachedBdoLocation,
  getLocation as getBdoLocation,
  getPermissionState,
  getLastLocationError,
  startWatch as startBdoWatch,
  stopWatch as stopBdoWatch,
  type LocationSource,
  type LocationError,
  type LocationPermissionState,
  type LocationResult,
} from "@/services/location";

const goldDoreImage = "/product-images/dore-nuggets-01.png";
const stampedGoldImage = "/product-images/stamped-piece-01.png";
const heritageGoldImage = "/product-images/art-bust.png";
const refinedGoldBarsImage = "/product-images/stamped-bar-01.png";
const jewelryImage = "/product-images/jewelry-chain.png";

type BuyerMode = "wholesale" | "retail";
type GoldCategorySlug = "dore" | "stamped" | "jewelry" | "gold-art";

type CategoryMeta = { label: string; icon: string; image: string; accent: string };

type CadastreMapApiItem = {
  id: string;
  cadastre_name: string | null;
  permit_number: string | null;
  region: string | null;
  status: string | null;
  site_type: string | null;
  risk_level: string | null;
  lat: number | null;
  lng: number | null;
  source_ref?: string | null;
  production_30d_g?: number | null;
  last_report_date?: string | null;
};

type CadastreOpportunityApiItem = {
  id: string;
  cadastre_name: string | null;
  permit_number: string | null;
  region: string | null;
  status: string | null;
  site_type: string | null;
  risk_level: string | null;
  current_capacity_kg_month?: number | null;
  capital_required_usd?: number | null;
  duration_months?: number | null;
  production_30d_g?: number | null;
  last_report_date?: string | null;
  lat?: number | null;
  lng?: number | null;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  dore: { label: "Doré (Raw Gold)", icon: "🪨", image: goldDoreImage, accent: "#EA580C" },
  stamped: { label: "Stamped bars (10g+)", icon: "🪙", image: refinedGoldBarsImage, accent: "#10B981" },
  jewelry: { label: "Gold Art & Heritage", icon: "🎭", image: heritageGoldImage, accent: "#EAB308" },
};

const GOLD_CATEGORY_META: Record<string, CategoryMeta> = {
  ...CATEGORY_META,
  dore: { ...CATEGORY_META.dore, label: "Doré (Raw Gold)", image: goldDoreImage, accent: "#EA580C" },
  stamped: {
    ...CATEGORY_META.stamped,
    label: "Stamped Gold",
    image: refinedGoldBarsImage,
    accent: "#10B981",
  },
  jewelry: {
    ...CATEGORY_META.jewelry,
    label: "Jewelry",
    image: jewelryImage,
    accent: "#A855F7",
  },
  "gold-art": {
    label: "Gold Art",
    icon: CATEGORY_META["jewelry"]?.icon || CATEGORY_META["stamped"]?.icon || "ART",
    image: heritageGoldImage,
    accent: "#EAB308",
  },
};

const MODE_CATEGORIES: Record<BuyerMode, GoldCategorySlug[]> = {
  wholesale: ["dore"],
  retail: ["stamped"],
};

const LOCATION_PROMPT_DONE_KEY = "bdo_location_prompt_done_v1";
const DEFAULT_MANUAL_LOCATION = { lat: 5.349, lon: -4.017, label: "Abidjan" };
const MANUAL_LOCATION_PRESETS = [
  DEFAULT_MANUAL_LOCATION,
  { lat: 6.366, lon: 2.433, label: "Cotonou" },
  { lat: 6.496, lon: 2.604, label: "Porto-Novo" },
  { lat: 6.137, lon: 1.212, label: "Lomé" },
  { lat: 5.603, lon: -0.187, label: "Accra" },
  { lat: 14.716, lon: -17.467, label: "Dakar" },
] as const;

const categoryIcons: Record<string, string> = {
  dore: "🪨",
  stamped: "🪙",
  "food-produce": "🍃",
  "food & produce": "🍃",
  handcrafts: "🎨",
  "textiles-clothing": "👗",
  "textiles & clothing": "👗",
  "beauty-cosmetics": "✨",
  "beauty & cosmetics": "✨",
  "art-decor": "🖼️",
  "art & decor": "🖼️",
  jewelry: "💎",
  agriculture: "🌾",
  beverages: "🍵",
  gold: "🥇",
  minerals: "💎",
  default: "📦"
};

const categoryColors: Record<string, string> = {
  "food-produce": "#22c55e",
  "food & produce": "#22c55e",
  handcrafts: "#f59e0b",
  "textiles-clothing": "#8b5cf6",
  "textiles & clothing": "#8b5cf6",
  "beauty-cosmetics": "#ec4899",
  "beauty & cosmetics": "#ec4899",
  "art-decor": "#3b82f6",
  "art & decor": "#3b82f6",
  jewelry: "#eab308",
  agriculture: "#84cc16",
  beverages: "#dc2626",
  gold: "#F59E0B",
  minerals: "#6366F1",
  default: "#F59E0B"
};

function normalizeCadastreStatus(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function cadastreStatusToPermitStatus(status: unknown): "active" | "pending" | "suspended" {
  const normalized = normalizeCadastreStatus(status);
  if (normalized === "VERIFIED") return "active";
  if (normalized === "INACTIVE") return "suspended";
  return "pending";
}

function cadastreStatusToMineVerification(status: unknown): "verified" | "pending" {
  return normalizeCadastreStatus(status) === "VERIFIED" ? "verified" : "pending";
}

function makeFallbackPermitPolygon(lat: number, lng: number, delta = 0.04): Array<[number, number]> {
  return [
    [lat + delta, lng - delta],
    [lat + delta, lng + delta],
    [lat - delta, lng + delta],
    [lat - delta, lng - delta],
  ];
}

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  shopId: number;
  shopName: string;
  categorySlug?: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: any[];
  actions?: { type: string; productId?: number; productName?: string; quantity?: number }[];
  productData?: Record<number, any>;
}

function extractConciergeJsonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();

  const withoutPrefix = trimmed.replace(/^json\s*/i, "").trim();
  if (withoutPrefix.startsWith("{") || withoutPrefix.startsWith("[")) return withoutPrefix;

  const firstBrace = withoutPrefix.indexOf("{");
  const lastBrace = withoutPrefix.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutPrefix.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function parseConciergePayloadFromText(text: string): Record<string, unknown> | null {
  const candidate = extractConciergeJsonCandidate(text);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getConciergeMessageText(text: string): string {
  const payload = parseConciergePayloadFromText(text);
  const message = payload?.message;
  if (typeof message === "string" && message.trim()) return message;
  return text;
}

function getConciergeSearchTerms(text: string): string[] {
  const payload = parseConciergePayloadFromText(text);
  const terms = payload?.searchTerms;
  if (Array.isArray(terms)) {
    return terms
      .map((term) => (typeof term === "string" ? term.trim() : ""))
      .filter(Boolean)
      .slice(0, 6);
  }
  return [];
}

function LocationUpdater({
  position,
  zoom,
  useMap,
}: {
  position: [number, number];
  zoom?: number;
  useMap: () => any;
}) {
  const map = useMap();
  useEffect(() => {
    const nextZoom = typeof zoom === "number" ? zoom : map.getZoom();
    map.setView(position, nextZoom, { animate: true });
  }, [map, position, zoom]);
  return null;
}

function MapFitBounds({
  points,
  paddingPx = 48,
  maxZoom = 14,
  useMap,
  L,
}: {
  points: Array<[number, number]> | null;
  paddingPx?: number;
  maxZoom?: number;
  useMap: () => any;
  L: any;
}) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const latLngs = points
      .map((p) => (Array.isArray(p) && p.length === 2 ? L.latLng(p[0], p[1]) : null))
      .filter(Boolean) as any[];
    if (latLngs.length === 0) return;
    const bounds = L.latLngBounds(latLngs);
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: L.point(paddingPx, paddingPx), animate: true, maxZoom });
  }, [map, points, paddingPx, maxZoom, L]);
  return null;
}

function MapResizer({
  depsKey,
  useMap,
}: {
  depsKey: string;
  useMap: () => any;
}) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        // ignore
      }
    }, 80);
    return () => window.clearTimeout(id);
  }, [map, depsKey]);
  return null;
}

function MapAutoSizer({
  depsKey,
  useMap,
}: {
  depsKey: string;
  useMap: () => any;
}) {
  const map = useMap();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof (window as any).ResizeObserver !== "function") return;
    const container = map?.getContainer?.();
    if (!container) return;

    let raf: number | null = null;
    let lastAt = 0;

    const trigger = () => {
      try {
        map.invalidateSize();
      } catch {
        // ignore
      }
    };

    const ro = new (window as any).ResizeObserver(() => {
      const now = Date.now();
      if (now - lastAt < 80) return;
      lastAt = now;
      if (raf != null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(trigger);
    });

    ro.observe(container);
    const warmup = window.setTimeout(trigger, 120);

    return () => {
      window.clearTimeout(warmup);
      if (raf != null) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [map, depsKey]);

  return null;
}

function ReelsMedia({ videoUrl, imageUrl }: { videoUrl: string | null; imageUrl: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoUrl) return;
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!videoRef.current) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            videoRef.current.play().catch(() => {
              // Autoplay may be blocked; user can tap to play.
            });
          } else {
            videoRef.current.pause();
          }
        }
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [videoUrl]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      {videoUrl ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={videoUrl}
          poster={imageUrl}
          muted
          loop
          playsInline
          preload="metadata"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) {
              v.play().catch(() => {
                // ignore
              });
            } else {
              v.pause();
            }
          }}
        />
      ) : (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );
}

function normalizeForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeCurrencyCode(value: unknown): Currency {
  const upper = String(value ?? "").toUpperCase();
  if (upper === "USD" || upper === "EUR" || upper === "GBP" || upper === "XOF" || upper === "GHS" || upper === "NGN" || upper === "AED") {
    return upper as Currency;
  }
  return "XOF";
}

function normalizeCategorySlug(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors (private mode/quota)
  }
}

function getMarketplaceCategory(product: any): string | null {
  return (
    normalizeCategorySlug(product?.categorySlug) ||
    normalizeCategorySlug(product?.categoryName) ||
    normalizeCategorySlug(product?.category?.slug) ||
    null
  );
}

function getGoldCategory(product: any): GoldCategorySlug | null {
  const rawSlug = normalizeForMatch(product?.categorySlug);
  const canonical = rawSlug ? rawSlug.replace(/[\s_]+/g, "-") : "";

  const categoryName = normalizeForMatch(product?.categoryName);
  const name = normalizeForMatch(product?.name);
  const text = `${canonical || rawSlug || ""} ${categoryName} ${name}`.trim();

  const looksLikeGoldArt =
    text.includes("gold-art") ||
    text.includes("gold art") ||
    text.includes("objet d art") ||
    text.includes("objet d'art") ||
    text.includes("heritage") ||
    text.includes("bust") ||
    text.includes("buste") ||
    text.includes("medallion") ||
    text.includes("medaillon") ||
    text.includes("relief") ||
    text.includes("ceremonial") ||
    text.includes("sculpt") ||
    text.includes("statue") ||
    text.includes("statuette") ||
    text.includes("mask") ||
    text.includes("masque") ||
    text.includes("artifact") ||
    text.includes("object");

  const looksLikeJewelry =
    text.includes("jewel") ||
    text.includes("bijou") ||
    text.includes("ring") ||
    text.includes("bracelet") ||
    text.includes("chain") ||
    text.includes("chaine") ||
    text.includes("pendant") ||
    text.includes("pendentif") ||
    text.includes("earring");

  if (canonical) {
    if (canonical === "goldart" || canonical === "gold-art") return "gold-art";
    if (canonical === "dore" || canonical === "stamped") return canonical as GoldCategorySlug;

    // If the product was categorized as jewelry but looks like a museum/heritage object,
    // treat it as Gold Art so it appears in the correct rail (common mis-categorization).
    if (canonical === "jewelry") return looksLikeGoldArt ? "gold-art" : "jewelry";
  }

  if (looksLikeGoldArt) return "gold-art";
  if (looksLikeJewelry) return "jewelry";

  const looksLikeGold =
    text.includes("gold") ||
    text.includes("dore") ||
    text.includes("dor") ||
    text.includes("karat") ||
    text.includes("22k") ||
    text.includes("bullion") ||
    categoryName.includes("mineral");
  if (!looksLikeGold) return null;

  if (text.includes("dore")) return "dore";
  if (text.includes("stamp") || text.includes("piece") || text.includes("bar")) return "stamped";

  return "stamped";
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getProductWeightGrams(product: any): number {
  const weight = toNumber(product?.weight);
  if (!weight) return 0;
  const unit = normalizeForMatch(product?.weightUnit);
  if (unit === "kg" || unit === "kilogram" || unit === "kilograms") return weight * 1000;
  return weight;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function obfuscateLatLng(lat: number, lng: number, key: string) {
  const random = mulberry32(hashString(key));
  const grid = 0.15; // ~16km
  const jitter = 0.03; // ~3km
  const snappedLat = Math.round(lat / grid) * grid;
  const snappedLng = Math.round(lng / grid) * grid;
  const dLat = (random() - 0.5) * 2 * jitter;
  const dLng = (random() - 0.5) * 2 * jitter;
  return { lat: snappedLat + dLat, lng: snappedLng + dLng };
}

function formatApproxDistance(distanceKm: number | null | undefined) {
  if (!distanceKm || !Number.isFinite(distanceKm)) return null;
  const step = distanceKm < 50 ? 5 : 10;
  return `~${Math.max(step, Math.round(distanceKm / step) * step)} km`;
}

type MineType = "artisanal" | "semi_artisanal" | "industrial";

function parseMaybeNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampMineAvailableKg(valueKg: number, mineType: MineType): number {
  if (!Number.isFinite(valueKg)) return mineType === "semi_artisanal" ? 1.2 : 0.6;
  if (mineType === "semi_artisanal") return clamp(valueKg, 1.0, 4.5);
  if (mineType === "industrial") return clamp(valueKg, 1.0, 5.0);
  return clamp(valueKg, 0.2, 1.8);
}

function normalizeMineType(value: unknown): MineType {
  const raw = String(value ?? "").trim();
  if (raw === "semi_artisanal" || raw === "artisanal" || raw === "industrial") return raw;
  return "artisanal";
}

function formatKgAsHuman(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return "0 g";
  if (kg < 1) return `${Math.round(kg * 1000)} g`;
  const decimals = kg < 2 ? 2 : 1;
  return `${kg.toFixed(decimals)} kg`;
}

function formatKgRangeAsHuman(minKg: number, maxKg: number): string {
  const a = Math.min(minKg, maxKg);
  const b = Math.max(minKg, maxKg);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return "—";
  const fmtKg = (kg: number) => {
    const decimals = kg < 2 ? 2 : 1;
    return `${kg.toFixed(decimals)} kg`;
  };
  if (b < 1) return `${Math.round(a * 1000)}–${Math.round(b * 1000)} g`;
  if (a < 1) return `${Math.round(a * 1000)} g–${fmtKg(b)}`;
  return `${fmtKg(a)}–${fmtKg(b)}`;
}

function createGoldShopIconLegacy(L: any, products?: any[]) {
  const totalStock = products?.reduce((sum, p) => sum + (p.stockQuantity || 0), 0) || 0;
  const stockKg = (totalStock / 1000).toFixed(0);
  const hasStock = totalStock > 0;
  
  const hasDore = products?.some(p => p.name?.toLowerCase().includes('doré') || p.name?.toLowerCase().includes('dore'));
  const hasRefined = products?.some(p => !p.name?.toLowerCase().includes('doré') && !p.name?.toLowerCase().includes('dore'));
  
  let borderColor = '#F59E0B';
  let typeLabel = 'GOLD';
  if (hasDore && !hasRefined) {
    borderColor = '#EA580C';
    typeLabel = 'DORÉ';
  } else if (hasRefined && !hasDore) {
    borderColor = '#10B981';
    typeLabel = 'REFINED';
  } else {
    typeLabel = 'MIXED';
  }
  
  return L.divIcon({
    html: `<div style="
      position: relative;
      width: 48px;
      height: 48px;
    ">
      <div style="
        width: 44px;
        height: 44px;
        border-radius: 50%;
        overflow: hidden;
        border: 3px solid ${borderColor};
        box-shadow: 0 2px 12px rgba(0,0,0,0.5);
        background: linear-gradient(135deg, #1a1a1a, #0a0a0a);
      ">
        <img src="${hasDore ? goldDoreImage : stampedGoldImage}" style="
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: ${hasStock ? 1 : 0.4};
        " />
      </div>
      <div style="
        position: absolute;
        bottom: -4px;
        left: 50%;
        transform: translateX(-50%);
        background: ${hasStock ? borderColor : '#6B7280'};
        color: ${hasStock ? '#000' : '#fff'};
        font-size: 8px;
        font-weight: bold;
        padding: 1px 4px;
        border-radius: 4px;
        white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      ">${hasStock ? stockKg + 'kg' : 'SOLD'}</div>
    </div>`,
    className: "gold-shop-marker",
    iconSize: [48, 52],
    iconAnchor: [24, 26],
  });
}

function createGoldShopIcon(
  L: any,
  products?: any[],
  opts?: {
    productionType?: string | null;
    mineType?: unknown;
    availableThisWeekKg?: unknown;
    estWeeklyOutputKg?: unknown;
    estWeeklyOutputRangeMinKg?: unknown;
    estWeeklyOutputRangeMaxKg?: unknown;
    estWeeklyOutputConfidence?: unknown;
  },
) {
  const totalStockRaw = products?.reduce((sum, p) => sum + (p.stockQuantity || 0), 0) || 0;
  const isMine = String(opts?.productionType || "") === "gold_mining";
  const mineType = normalizeMineType(opts?.mineType);
  const explicitMineKg = parseMaybeNumber(opts?.availableThisWeekKg);
  const mineAvailableKg = isMine ? clampMineAvailableKg(explicitMineKg ?? totalStockRaw / 1000, mineType) : null;

  const estWeeklyOutputKg = parseMaybeNumber(opts?.estWeeklyOutputKg);
  const rangeMinFromOpts = parseMaybeNumber(opts?.estWeeklyOutputRangeMinKg);
  const rangeMaxFromOpts = parseMaybeNumber(opts?.estWeeklyOutputRangeMaxKg);

  const rangeMinKg = rangeMinFromOpts != null ? rangeMinFromOpts : estWeeklyOutputKg != null ? estWeeklyOutputKg * 0.6 : 1.0;
  const rangeMaxKg = rangeMaxFromOpts != null ? rangeMaxFromOpts : estWeeklyOutputKg != null ? estWeeklyOutputKg * 1.2 : 2.0;
  const safeRangeMinKg = clamp(rangeMinKg, 0.05, 50);
  const safeRangeMaxKg = clamp(rangeMaxKg, 0.05, 50);
  const outputRangeMinKg = Math.min(safeRangeMinKg, safeRangeMaxKg);
  const outputRangeMaxKg = Math.max(safeRangeMinKg, safeRangeMaxKg);

  const doreStockRaw =
    (products || []).reduce((sum, p) => sum + (getGoldCategory(p) === "dore" ? (p.stockQuantity || 0) : 0), 0) || 0;
  const doreAvailableKgRaw = doreStockRaw > 0 ? doreStockRaw / 1000 : 0;
  const doreDisplayKg = doreAvailableKgRaw > 0 ? Math.min(doreAvailableKgRaw, outputRangeMaxKg * 1.5) : 0;
  const doreSafetyCapKg = mineType === "industrial" ? Number.POSITIVE_INFINITY : 5;
  const doreCappedKg = doreDisplayKg > 0 ? Math.min(doreDisplayKg, doreSafetyCapKg) : 0;
  const dorePrimaryLabel =
    doreCappedKg > 0 ? formatKgAsHuman(doreCappedKg) : `~${formatKgRangeAsHuman(outputRangeMinKg, outputRangeMaxKg)}/wk`;

  const totalStock = isMine ? Math.round((mineAvailableKg ?? 0) * 1000) : totalStockRaw;
  const hasStock = totalStock > 0;

  const categories = new Set((products || []).map(getGoldCategory));
  const hasDore = categories.has("dore");
  const hasStamped = categories.has("stamped");
  const hasJewelry = categories.has("jewelry");
  const hasGoldArt = categories.has("gold-art");

  const categoryCount = [hasDore, hasStamped, hasJewelry, hasGoldArt].filter(Boolean).length;
  const isMixed = categoryCount > 1;

  const primaryCategory: GoldCategorySlug = hasDore
    ? "dore"
    : hasStamped
      ? "stamped"
      : hasJewelry
        ? "jewelry"
        : hasGoldArt
          ? "gold-art"
          : "dore";
  const meta = GOLD_CATEGORY_META[primaryCategory];

  const borderColor = isMixed ? "#F59E0B" : meta.accent;
  const typeLabel = isMixed
    ? "MIXED"
    : primaryCategory === "dore"
      ? "DORÉ"
      : primaryCategory === "stamped"
        ? "STAMPED"
        : "MAKER";
  const isPureDore = primaryCategory === "dore" && !isMixed;
  const hasDoreLots = doreStockRaw > 0;
  const doreLots = (products || []).filter((p: any) => getGoldCategory(p) === "dore").length;
  const quantityLabel = (() => {
    if (!hasStock) return "SOLD";
    if (isMine && mineAvailableKg != null) return formatKgAsHuman(mineAvailableKg);
    if (totalStock >= 1000) {
      const kg = totalStock / 1000;
      const decimals = kg >= 100 ? 0 : 1;
      return `${kg.toFixed(decimals)} kg`;
    }
    return `${Math.round(totalStock)} g`;
  })();
  const markerPrimary = isPureDore ? dorePrimaryLabel : hasStock ? typeLabel : "SOLD";
  const markerSecondary = isPureDore && hasDoreLots ? (doreLots > 1 ? `${typeLabel} · ${doreLots} lots` : typeLabel) : null;
  const badgeActive = hasStock || isPureDore;

  return L.divIcon({
    html: `<div style="
      position: relative;
      width: 48px;
      height: 48px;
    ">
      <div style="
        width: 44px;
        height: 44px;
        border-radius: 50%;
        overflow: hidden;
        border: 3px solid ${borderColor};
        box-shadow: 0 2px 12px rgba(0,0,0,0.5);
        background: linear-gradient(135deg, #1a1a1a, #0a0a0a);
      ">
        <img src="${meta.image}" style="
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: ${hasStock ? 1 : 0.4};
        " />
      </div>
      <div style="
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        background: ${badgeActive ? borderColor : '#6B7280'};
        color: ${badgeActive ? '#000' : '#fff'};
        font-weight: 800;
        padding: ${markerSecondary ? "3px 6px" : "2px 6px"};
        border-radius: 9px;
        white-space: nowrap;
        box-shadow: 0 1px 6px rgba(0,0,0,0.35);
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.05;
        letter-spacing: 0.2px;
       ">
         <div style="font-size: ${markerSecondary ? "10px" : "8px"};">${markerPrimary}</div>
         ${markerSecondary ? `<div style="font-size: 7px; font-weight: 800; opacity: 0.95;">${markerSecondary}</div>` : ""}
       </div>
      </div>`,
    className: "gold-shop-marker",
    iconSize: [48, 52],
    iconAnchor: [24, 26],
  });
}

function clampMarkerSize(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(20, Math.min(72, Math.round(n)));
}

function createShopIcon(
  L: any,
  category?: string,
  productionType?: string,
  markerStyle?: {
    iconType?: string;
    iconValue?: string;
    color?: string;
    size?: number;
  } | null,
) {
  let categoryKey = category?.toLowerCase() || "default";
  
  if (productionType === 'gold_mining' || categoryKey.includes('gold') || categoryKey.includes('mineral')) {
    categoryKey = 'gold';
  }
  
  const fallbackEmoji = categoryIcons[categoryKey] || categoryIcons.default;
  const fallbackColor = categoryColors[categoryKey] || categoryColors.default;
  const iconType = String(markerStyle?.iconType || "").toLowerCase();
  const rawIconValue = String(markerStyle?.iconValue || "").trim();
  const lucideName = rawIconValue.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const lucideEmojiMap: Record<string, string> = {
    "shopping-cart": "🛒",
    "store": "🏪",
    "shirt": "👗",
    "sparkles": "🧴",
    "tv": "📺",
    "smartphone": "📱",
    "house": "🏠",
    "pill": "💊",
    "hammer": "🧱",
    "car": "🚗",
  };
  const resolvedEmoji =
    iconType === "emoji" && rawIconValue
      ? rawIconValue
      : iconType === "lucide" && lucideEmojiMap[lucideName]
        ? lucideEmojiMap[lucideName]
        : fallbackEmoji;
  const color = /^#[0-9a-f]{6}$/i.test(String(markerStyle?.color || "").trim())
    ? String(markerStyle?.color)
    : fallbackColor;
  const size = clampMarkerSize(markerStyle?.size, 40);
  const iconSize = Math.max(14, Math.min(36, Math.round(size * 0.5)));

  const iconHtml =
    iconType === "image_url" && rawIconValue
      ? `<img src="${rawIconValue.replace(/"/g, "&quot;")}" alt="" style="width:${iconSize}px;height:${iconSize}px;object-fit:contain;border-radius:9999px;" />`
      : `<span style="font-size:${iconSize}px;line-height:1;">${resolvedEmoji}</span>`;
  
  return L.divIcon({
    html: `<div style="
      background: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
    ">${iconHtml}</div>`,
    className: "custom-shop-marker",
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
  });
}

function createMachineryIcon(L: any, item: { status: string }) {
  const status = String(item.status || "in_stock");
  const color =
    status === "in_stock"
      ? "#3B82F6"
      : status === "built_to_order"
        ? "#F59E0B"
        : status === "used"
          ? "#94A3B8"
          : status === "reserved"
            ? "#A855F7"
            : "#F43F5E";
  const label =
    status === "in_stock"
      ? "IN STOCK"
      : status === "built_to_order"
        ? "BUILD"
        : status === "used"
          ? "USED"
          : status === "reserved"
            ? "HOLD"
            : "OFF";

  return L.divIcon({
    html: `<div style="
      position: relative;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(15,23,42,0.9), rgba(2,6,23,0.9));
      border: 2px solid ${color};
      box-shadow: 0 2px 12px rgba(0,0,0,0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    ">
      ⚙️
      <div style="
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        background: ${color};
        color: #000;
        font-size: 8px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 999px;
        white-space: nowrap;
        box-shadow: 0 1px 6px rgba(0,0,0,0.35);
      ">${label}</div>
    </div>`,
    className: "machinery-marker",
    iconSize: [44, 50],
    iconAnchor: [22, 25],
  });
}

function createOpportunityIcon(L: any, item: { mineVerificationStatus?: string }) {
  const color = "#10B981";
  const label = "CADASTRE";

  return L.divIcon({
    html: `<div style="
      position: relative;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(6,78,59,0.25), rgba(2,6,23,0.9));
      border: 2px solid ${color};
      box-shadow: 0 2px 12px rgba(0,0,0,0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    ">
      ⛏️
      <div style="
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        background: ${color};
        color: #000;
        font-size: 8px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 999px;
        white-space: nowrap;
        box-shadow: 0 1px 6px rgba(0,0,0,0.35);
      ">${label}</div>
    </div>`,
    className: "investment-marker",
    iconSize: [44, 50],
    iconAnchor: [22, 25],
  });
}

type BuyerHomePageProps = {
  mapEnabled?: boolean;
  defaultRadiusKm?: number;
  storefrontHero?: TenantStorefrontHero | null;
  uiMarker?: string;
};

export function BuyerHomePage({
  mapEnabled: mapEnabledProp,
  defaultRadiusKm,
  storefrontHero,
  uiMarker,
}: BuyerHomePageProps = {}) {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const session = useSession();
  const isMobile = useIsMobile();
  const { tenant, brand } = useTenant();
  const tenantConfig = useMemo(() => getTenantConfigByKey(tenant.key), [tenant.key]);
  const tenantIdentity = useMemo(() => getTenantIdentity(tenant.key), [tenant.key]);
  const retailModeLabel = tenantIdentity.retailModeLabel;
  const tenantPlaceholderProductImage = getTenantPlaceholderProductImage(tenant.key);
  const mapEnabled = mapEnabledProp ?? hasTenantModule(tenant.key, "map");
  const effectiveStorefrontHero = storefrontHero ?? tenantConfig?.storefrontHero ?? null;
  const isGoldTenant = tenant.key === "bdo";
  const storefrontMarketType = tenantConfig?.storefrontMarketType || (isGoldTenant ? "PROXIMITY" : "ALL");
  const useProximityRadius = isGoldTenant || storefrontMarketType === "PROXIMITY";
  const hasZoguelandStoryGenerator =
    tenant.key === "zogueland" &&
    (hasTenantModule(tenant.key, "stories") || hasTenantModule(tenant.key, "safe_ai_chat"));
  const [storyCharacter, setStoryCharacter] = useState("");
  const [storyWorld, setStoryWorld] = useState("");
  const [storyMission, setStoryMission] = useState("");
  const [storyTone, setStoryTone] = useState("curious");
  const [storyLength, setStoryLength] = useState<"short" | "medium" | "long">("medium");
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyResult, setStoryResult] = useState<{ title: string; story: string; safetyLabel?: string | null } | null>(null);

  useEffect(() => {
    const invalidateMarketplace = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/nearby"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/feed"] });
    };

    const handler = (event: StorageEvent) => {
      if (event.key !== MARKETPLACE_REFRESH_STORAGE_KEY) return;
      invalidateMarketplace();
    };

    const sameTabHandler = () => invalidateMarketplace();

    window.addEventListener("storage", handler);
    window.addEventListener(MARKETPLACE_REFRESH_EVENT, sameTabHandler as any);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(MARKETPLACE_REFRESH_EVENT, sameTabHandler as any);
    };
  }, []);

  const forcedBuyerMode: BuyerMode | null =
    location.startsWith("/zone") || location.startsWith("/retail")
      ? "retail"
      : location.startsWith("/wholesale")
        ? "wholesale"
        : null;
  const requiresVerification = tenant.featureFlags?.requireVerifiedBrowse === true;
  const isVerifiedForSpaces =
    session.user?.verificationLevel === "BASIC_VERIFIED" || session.user?.verificationLevel === "GOLD_VERIFIED";
  const showVerificationGate = requiresVerification && (!session.isAuthenticated || !isVerifiedForSpaces);
  const { formatCurrency, formatAmount, t, language, currency, setLanguage, setCurrency, applyAutoLocaleFromCountry } = useLocale();
  const formatMoney = (amount: number, fromCurrency: unknown, suffix?: string) =>
    formatAmount(amount, normalizeCurrencyCode(fromCurrency), suffix);
  const retailPanelTitle = isGoldTenant ? t("buyer.panel.retailGold.title") : tenantIdentity.platformLabel;
  const retailPanelSubtitle = isGoldTenant
    ? t("buyer.panel.retailGold.subtitle")
    : String(effectiveStorefrontHero?.subtitle || "").trim() || t("buyer.panel.retailNearby.subtitle");
  const noProductsTitle = isGoldTenant
    ? t("buyer.noProducts.titleGold")
    : useProximityRadius
      ? t("buyer.noProducts.titleGeneral")
      : t("buyer.noProducts.titleGlobal");


  type GeoCountry = { id: number; code: string; name: string };
  type GeoRegion = { id: number; name: string };
  type GeoCity = { id: number; name: string; latitude?: string | null; longitude?: string | null };
  type ActiveGeo = {
    country: GeoCountry | null;
    region: GeoRegion | null;
    city: GeoCity | null;
    source: "gps" | "ip" | "manual" | "stored";
  };

  const savedGeo = (() => {
    try {
      const raw = localStorage.getItem("marketplace_location_v1");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as any;
      if (!parsed || typeof parsed !== "object") return null;
      if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
      return parsed;
    } catch {
      return null;
    }
  })();

  const cachedBdoLocation = getCachedBdoLocation();

  const locationToastShownRef = useRef(false);

  const normalizedSavedSource: ActiveGeo["source"] =
    savedGeo?.source === "manual"
      ? "manual"
      : savedGeo?.source === "device" || savedGeo?.source === "gps"
        ? "gps"
        : savedGeo?.source === "ip"
          ? "ip"
          : "stored";

  const initialSource: LocationSource =
    cachedBdoLocation?.source ??
    (normalizedSavedSource === "gps" || normalizedSavedSource === "manual" ? normalizedSavedSource : "ip");

  const [locationSource, setLocationSource] = useState<LocationSource>(initialSource);
  // Location should never block first-time users. We resolve an IP-based approximation in the background,
  // and only show the location prompt if the user explicitly asks to set/upgrade their location.
  const [locationPromptOpen, setLocationPromptOpen] = useState(false);
  const [locationPromptMode, setLocationPromptMode] = useState<"prompt" | "denied" | "error">("prompt");
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("bdo_nearby_radius_km_v1");
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        return useProximityRadius ? parsed : Math.max(parsed, 500);
      }
    } catch {
      // ignore
    }
    if (!useProximityRadius) return 500;
    if (Number.isFinite(defaultRadiusKm) && Number(defaultRadiusKm) > 0) return Number(defaultRadiusKm);
    if (Number.isFinite(tenantConfig?.defaultRadiusKm) && Number(tenantConfig?.defaultRadiusKm) > 0) {
      return Number(tenantConfig?.defaultRadiusKm);
    }
    return initialSource === "gps" ? 30 : 100;
  });
  const [radiusCustomized, setRadiusCustomized] = useState(() => {
    try {
      return localStorage.getItem("bdo_nearby_radius_km_v1") != null;
    } catch {
      return false;
    }
  });
  const [productsPerSeller, setProductsPerSeller] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("bdo_products_per_seller_v1");
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
    } catch {
      // ignore
    }
    return 0;
  });

  useEffect(() => {
    try {
      if (productsPerSeller > 0) {
        localStorage.setItem("bdo_products_per_seller_v1", String(productsPerSeller));
      } else {
        localStorage.removeItem("bdo_products_per_seller_v1");
      }
    } catch {
      // ignore
    }
  }, [productsPerSeller]);

  const [userPosition, setUserPosition] = useState<[number, number]>(() => {
    if (cachedBdoLocation) return [cachedBdoLocation.lat, cachedBdoLocation.lon];
    if (savedGeo) return [savedGeo.lat, savedGeo.lng];
    return [7.54, -5.55];
  });
  const [activeGeo, setActiveGeo] = useState<ActiveGeo>(() => {
    if (!savedGeo) return { country: null, region: null, city: null, source: cachedBdoLocation ? initialSource : "stored" };
    const savedSource: ActiveGeo["source"] = normalizedSavedSource;
    return {
      country: savedGeo.country || null,
      region: savedGeo.region || null,
      city: savedGeo.city || null,
      source: savedSource,
    };
  });
  const [locationLabelOverride, setLocationLabelOverride] = useState<string>(() => {
    const raw = savedGeo?.label;
    return typeof raw === "string" ? raw.trim() : "";
  });
  const [locationPermissionState, setLocationPermissionState] = useState<LocationPermissionState>(() => "unknown");
  const [locationUsedFallback, setLocationUsedFallback] = useState(false);
  const [locationLastError, setLocationLastError] = useState<LocationError | null>(() => getLastLocationError());
  const locationHelpText = useMemo(() => {
    if (locationRequesting) return t("location.help.requesting");

    const kind = locationLastError?.kind;
    if (kind === "insecure_context") return t("location.help.secureContext");
    if (kind === "permission_denied" || locationPermissionState === "denied") return t("location.help.denied");
    if (kind === "timeout") return t("location.help.timeout");
    if (kind === "position_unavailable") return t("location.help.positionUnavailable");
    if (kind === "not_supported") return t("location.help.unavailable");
    if (kind) return t("location.help.errorGeneric");

    if (locationSource === "gps") return t("location.help.active");
    return t("location.subtitle");
  }, [locationLastError?.kind, locationPermissionState, locationRequesting, locationSource, t]);
  const [mapZoom] = useState(7);

  const [buyerMode, setBuyerMode] = useState<BuyerMode>(() => {
    if (forcedBuyerMode) return forcedBuyerMode;
    const fromUser = session.user?.buyerType;
    if (fromUser === "wholesale" || fromUser === "retail") return fromUser;

    const stored = safeLocalStorageGet("buyer_mode");
    if (stored === "wholesale" || stored === "retail") return stored;

    return "retail";
  });
  const [marketMode, setMarketMode] = useState<MiningModuleMode>(() => {
    const stored = safeLocalStorageGet("market_mode");
    if (stored === "marketplace" || stored === "dore" || stored === "machinery" || stored === "investments") {
      if (!isGoldTenant && (stored === "machinery" || stored === "investments")) return "marketplace";
      return stored;
    }
    return "marketplace";
  });
  const isFeedMode = marketMode === "marketplace" || marketMode === "dore";

  useEffect(() => {
    if (!radiusCustomized) return;
    try {
      localStorage.setItem("bdo_nearby_radius_km_v1", String(radiusKm));
    } catch {
      // ignore
    }
  }, [radiusKm, radiusCustomized]);

  useEffect(() => {
    if (radiusCustomized) return;
    if (!useProximityRadius) {
      setRadiusKm(500);
      return;
    }
    const next =
      buyerMode === "retail"
        ? locationSource === "gps"
          ? 10
          : 50
        : locationSource === "gps"
          ? 30
          : 100;
    setRadiusKm(next);
  }, [locationSource, radiusCustomized, buyerMode, useProximityRadius]);

  useEffect(() => {
    if (!locationPromptOpen) return;
    getPermissionState().then((state) => {
      setLocationPermissionState(state);
      if (state === "denied") setLocationPromptMode("denied");
    });
  }, [locationPromptOpen]);
  const [machineryFilters, setMachineryFilters] = useState<MachineryFilters>({
    query: "",
    category: "all",
    condition: "all",
    status: "all",
    country: DEFAULT_COUNTRY,
    region: "all",
  });
  const [investmentFilters, setInvestmentFilters] = useState<InvestmentFilters>({
    query: "",
    country: DEFAULT_COUNTRY,
    region: "all",
  });
  const [selectedMachinery, setSelectedMachinery] = useState<MachineryItem | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<InvestmentOpportunity | null>(null);
  const [participateOpen, setParticipateOpen] = useState(false);
  const [participateStep, setParticipateStep] = useState<1 | 2 | 3 | 4>(1);
  const [participateTemplateKey, setParticipateTemplateKey] = useState<"revenue_share" | "premium_per_rotation">(
    "revenue_share",
  );
  const [participateBureauId, setParticipateBureauId] = useState<number | null>(null);
  const [participatePrincipal, setParticipatePrincipal] = useState<string>("");
  const [participateDraftContract, setParticipateDraftContract] = useState<any>(null);
  const [participateSubmitting, setParticipateSubmitting] = useState(false);
  const [participateSigning, setParticipateSigning] = useState(false);
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [customEquipmentOpen, setCustomEquipmentOpen] = useState(false);
  const [customEquipmentForm, setCustomEquipmentForm] = useState({
    category: "extraction",
    name: "",
    targetCapacity: "",
    powerSource: "Diesel",
    conditionPreference: "new",
    budgetMin: "",
    budgetMax: "",
    budgetCurrency: "USD",
    deliveryLocation: DEFAULT_COUNTRY,
    deliveryRegion: "Abidjan",
    timelineNeeded: "",
    notes: "",
  });
	  const [mineListingOpen, setMineListingOpen] = useState(false);
	  const [cadastreSearch, setCadastreSearch] = useState("");
	  const [cadastreCountry, setCadastreCountry] = useState<string>("all");
	  const [cadastreSelectedPermit, setCadastreSelectedPermit] = useState<CadastrePermit | null>(null);
	  const [cadastreProofFileName, setCadastreProofFileName] = useState("");
	  const [cadastreClaimNote, setCadastreClaimNote] = useState("");
	  const [cadastreClaims, setCadastreClaims] = useState<any[]>(() => {
	    try {
	      return JSON.parse(localStorage.getItem("cadastre_claims_v1") || "[]");
	    } catch {
	      return [];
	    }
	  });
	  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	  const [categoriesSheetOpen, setCategoriesSheetOpen] = useState(false);
	  const categoryChipsRef = useRef<HTMLDivElement | null>(null);
	  const [categoryChipsUi, setCategoryChipsUi] = useState<{ atStart: boolean; atEnd: boolean; overflow: boolean }>({
	    atStart: true,
	    atEnd: true,
	    overflow: false,
	  });
	  const [searchQuery, setSearchQuery] = useState("");
	  const [seedInventoryLoading, setSeedInventoryLoading] = useState(false);
	  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [conciergeHidden, setConciergeHidden] = useState(false);
  const [wholesaleApplyOpen, setWholesaleApplyOpen] = useState(false);
  const [wholesaleLicenseFileName, setWholesaleLicenseFileName] = useState<string>(() => {
    return safeLocalStorageGet("wholesale_license_file") || "";
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: t("chat.welcome") }
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const conciergeTouchStartY = useRef<number | null>(null);
  const conciergeScrollTimeoutRef = useRef<number | null>(null);
  const [keyboardInsetPx, setKeyboardInsetPx] = useState(0);
  const [modeStackExpanded, setModeStackExpanded] = useState(false);
  const [feedSort, setFeedSort] = useState<"default" | "price_asc" | "price_desc" | "distance">("default");
  const [mapOverlayOpen, setMapOverlayOpen] = useState(false);
  const [leafletDeps, setLeafletDeps] = useState<null | {
    L: any;
    MapContainer: any;
    TileLayer: any;
    Marker: any;
    Popup: any;
    Circle: any;
    Polygon: any;
    useMap: any;
  }>(null);
  const railRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const railInitializedRef = useRef<Set<string>>(new Set());
  const [activeRailSlug, setActiveRailSlug] = useState<string | null>(null);
  const [visibleRailShopIds, setVisibleRailShopIds] = useState<number[]>([]);
  const [hoveredRailShopId, setHoveredRailShopId] = useState<number | null>(null);
  const railScrollRafRef = useRef<number | null>(null);
  const retailAutoLoadRef = useRef<number>(0);
  const [railScrollUi, setRailScrollUi] = useState<
    Record<string, { atStart: boolean; atEnd: boolean; progress: number; thumbPct: number }>
  >({});
  const railScrollbarTrackRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const railScrollbarDragRef = useRef<{
    slug: string | null;
    pointerId: number | null;
    trackLeft: number;
    trackWidth: number;
    thumbWidthPx: number;
    maxScroll: number;
  }>({ slug: null, pointerId: null, trackLeft: 0, trackWidth: 0, thumbWidthPx: 0, maxScroll: 0 });
  const holdScrollRef = useRef<{
    slug: string | null;
    direction: 1 | -1;
    rafId: number | null;
    lastTs: number | null;
    delayTimerId: number | null;
    suppressClick: boolean;
  }>({ slug: null, direction: 1, rafId: null, lastTs: null, delayTimerId: null, suppressClick: false });
  const railPointerDragRef = useRef<{
    slug: string | null;
    pointerId: number | null;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({ slug: null, pointerId: null, startX: 0, startScrollLeft: 0, moved: false });
  const railClickSuppressUntilRef = useRef<number>(0);
  const retailScrollHintStorageKey = `retail_scroll_hint_dismissed_v1:${tenant.key}`;
  const [retailScrollHintState, setRetailScrollHintState] = useState<"hidden" | "visible" | "fading">("hidden");
  const retailScrollHintHideTimerRef = useRef<number | null>(null);
  const primaryTouchStart = useRef<{ x: number; y: number } | null>(null);
  const canShowMapRef = useRef(true);
  canShowMapRef.current = mapEnabled;
  const lastQueryHandledRef = useRef<string | null>(null);
  const [slowNearbyLoading, setSlowNearbyLoading] = useState(false);
  const seedSyntheticInventory = useCallback(
    async (count: number = 10) => {
      if (seedInventoryLoading) return;
      setSeedInventoryLoading(true);
      try {
        const result = await apiRequest("/api/admin/seed/jewelers", "POST", { count });
        toast({
          title: "Seeded marketplace inventory",
          description: `${Number(result?.sellersCreated ?? 0)} sellers • ${Number(result?.productsCreated ?? 0)} products`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/nearby"] });
        queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/feed"] });
      } catch (err: any) {
        toast({
          title: t("common.error"),
          description: err?.message || "Seed failed",
          variant: "destructive",
        });
      } finally {
        setSeedInventoryLoading(false);
      }
    },
    [seedInventoryLoading, toast, t],
  );

  const dismissRetailScrollHint = useCallback(() => {
    setRetailScrollHintState((prev) => {
      if (prev === "hidden" || prev === "fading") return prev;
      return "fading";
    });
    safeLocalStorageSet(retailScrollHintStorageKey, "true");
    if (retailScrollHintHideTimerRef.current) window.clearTimeout(retailScrollHintHideTimerRef.current);
    retailScrollHintHideTimerRef.current = window.setTimeout(() => {
      retailScrollHintHideTimerRef.current = null;
      setRetailScrollHintState("hidden");
    }, 420);
  }, [retailScrollHintStorageKey]);

  useEffect(() => {
    if (retailScrollHintState !== "visible") return;
    if (retailScrollHintHideTimerRef.current) window.clearTimeout(retailScrollHintHideTimerRef.current);
    retailScrollHintHideTimerRef.current = window.setTimeout(() => dismissRetailScrollHint(), 3000);
    return () => {
      if (retailScrollHintHideTimerRef.current) window.clearTimeout(retailScrollHintHideTimerRef.current);
      retailScrollHintHideTimerRef.current = null;
    };
  }, [retailScrollHintState, dismissRetailScrollHint]);

  useEffect(() => {
    setChatMessages((prev) =>
      prev.map((m) => (m.id === "welcome" ? { ...m, content: t("chat.welcome") } : m)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    return () => {
      if (conciergeScrollTimeoutRef.current) window.clearTimeout(conciergeScrollTimeoutRef.current);
      if (holdScrollRef.current.delayTimerId) window.clearTimeout(holdScrollRef.current.delayTimerId);
      if (holdScrollRef.current.rafId) cancelAnimationFrame(holdScrollRef.current.rafId);
    };
  }, []);

  const openConcierge = (opts?: { focus?: boolean }) => {
    const shouldFocus = opts?.focus !== false;
    setConciergeOpen(true);
    if (shouldFocus) setTimeout(() => chatInputRef.current?.focus(), 50);
  };

  const closeConcierge = () => setConciergeOpen(false);

  const handlePrimaryTouchStart = (event: any) => {
    if (!isMobile) return;
    if (event?.target?.closest?.("[data-mobile-nav]")) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    primaryTouchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handlePrimaryTouchEnd = (event: any) => {
    if (!isMobile) return;
    const start = primaryTouchStart.current;
    if (!start) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    primaryTouchStart.current = null;
    if (Math.abs(deltaX) < 80 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;
    const width = window.innerWidth || 0;
    if (deltaX < 0 && start.x > width - 48 && canShowMapRef.current) {
      setMapOverlayOpen(true);
    } else if (mapEnabled && deltaX > 0 && (start.x < 48 || mapOverlayOpen)) {
      setMapOverlayOpen(false);
    }
  };

  const handleFeedScroll = () => {
    if (!isMobile) return;
    setConciergeHidden(true);
    if (conciergeScrollTimeoutRef.current) window.clearTimeout(conciergeScrollTimeoutRef.current);
    conciergeScrollTimeoutRef.current = window.setTimeout(() => {
      setConciergeHidden(false);
    }, 700);
  };

  const cartStorageKey = "bdo_cart_v1";
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(cartStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item: any) => ({
          productId: Number(item?.productId),
          name: String(item?.name ?? ""),
          price: Number(item?.price ?? 0),
          quantity: Math.max(1, Math.floor(Number(item?.quantity ?? 1))),
          shopId: Number(item?.shopId),
          shopName: String(item?.shopName ?? ""),
          categorySlug: normalizeCategorySlug(item?.categorySlug) || null,
        }))
        .filter((item: CartItem) => Number.isFinite(item.productId) && item.productId > 0 && item.name && Number.isFinite(item.price));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<any>(null);
  const [shopProductCategory, setShopProductCategory] = useState<string>("all");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [checkoutData, setCheckoutData] = useState<{
    buyerType: string;
    companyName: string;
    paymentMethod: string;
    depositAmount: number;
  }>({ buyerType: "", companyName: "", paymentMethod: "", depositAmount: 0 });
  const [checkoutMessages, setCheckoutMessages] = useState<{role: "assistant" | "user"; content: string}[]>([]);
  const [pickupPartnerId, setPickupPartnerId] = useState<string>(() => safeLocalStorageGet("bdo_pickup_partner_v1") || "");
  const [pickupPartners, setPickupPartners] = useState<Array<{ id: string; name: string }>>([]);
  const [pickupPartnersLoading, setPickupPartnersLoading] = useState(false);
  const cartHasStamped = useMemo(() => cart.some((item) => item.categorySlug === "stamped"), [cart]);

  useEffect(() => {
    if (!pickupPartnerId) return;
    safeLocalStorageSet("bdo_pickup_partner_v1", pickupPartnerId);
  }, [pickupPartnerId]);

  useEffect(() => {
    if (!checkoutOpen || !cartHasStamped) return;
    let cancelled = false;
    setPickupPartnersLoading(true);
    fetch(resolveApiUrl("/api/stamped-gold/jewellers/public"), { headers: { ...getDemoModeHeaders() } })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.jewellers) ? data.jewellers : [];
        setPickupPartners(rows.filter((j: any) => j?.isActive).map((j: any) => ({ id: String(j.id), name: String(j.name) })));
      })
      .catch(() => {
        if (!cancelled) setPickupPartners([]);
      })
      .finally(() => {
        if (!cancelled) setPickupPartnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkoutOpen, cartHasStamped]);

  type MachineryRequestAnswers = {
    category: "extraction" | "processing" | "support" | "mobility" | "spare_parts";
    conditionPreference: "new" | "refurbished" | "used";
    name: string;
    targetCapacity: string;
    powerSource: "Diesel" | "Electric" | "Hybrid" | "Solar" | string;
    budgetMin: string;
    budgetMax: string;
    budgetCurrency: "USD" | "EUR" | "XOF" | "AED" | string;
    deliveryCountry: string;
    deliveryCityRegion: string;
    deliveryAddress: string;
    timelineNeeded: string;
    notes: string;
  };

  const machineryRequestSteps = (answers: MachineryRequestAnswers): ChatWizardStep<MachineryRequestAnswers>[] => [
    {
      id: "category",
      title: "Category",
      kind: "cards",
      field: "category",
      prompt: "What type of equipment do you need?",
      options: [
        { value: "extraction", title: "Extraction" },
        { value: "processing", title: "Processing" },
        { value: "support", title: "Support" },
        { value: "mobility", title: "Mobility" },
        { value: "spare_parts", title: "Spare parts" },
      ],
    },
    {
      id: "condition",
      title: "Condition",
      kind: "cards",
      field: "conditionPreference",
      prompt: "Condition preference?",
      options: [
        { value: "new", title: "New" },
        { value: "refurbished", title: "Refurbished" },
        { value: "used", title: "Used" },
      ],
    },
    {
      id: "name",
      title: "Equipment",
      kind: "text",
      field: "name",
      prompt: "Equipment name / type?",
      placeholder: "e.g., Trommel 2m, Crusher jaw plate",
    },
    {
      id: "capacity",
      title: "Capacity",
      kind: "text",
      field: "targetCapacity",
      prompt: "Target capacity?",
      placeholder: "e.g., 20 t/h, 250 kVA",
    },
    {
      id: "power",
      title: "Power",
      kind: "cards",
      field: "powerSource",
      prompt: "Power source?",
      options: [
        { value: "Diesel", title: "Diesel" },
        { value: "Electric", title: "Electric" },
        { value: "Hybrid", title: "Hybrid" },
        { value: "Solar", title: "Solar" },
      ],
    },
    {
      id: "budgetCurrency",
      title: "Currency",
      kind: "cards",
      field: "budgetCurrency",
      prompt: "Budget currency?",
      options: [
        { value: "USD", title: "USD" },
        { value: "EUR", title: "EUR" },
        { value: "AED", title: "AED" },
        { value: "XOF", title: "XOF" },
      ],
    },
    {
      id: "budgetMin",
      title: "Budget Min",
      kind: "text",
      field: "budgetMin",
      prompt: "Budget minimum?",
      placeholder: "e.g., 10000",
      inputMode: "decimal",
    },
    {
      id: "budgetMax",
      title: "Budget Max",
      kind: "text",
      field: "budgetMax",
      prompt: "Budget maximum?",
      placeholder: "e.g., 25000",
      inputMode: "decimal",
    },
    {
      id: "deliveryCountry",
      title: "Delivery",
      kind: "custom",
      prompt: "Delivery country?",
      isComplete: (a) => !!a.deliveryCountry,
      render: ({ answers, setAnswer }) => (
        <CountryCombobox value={answers.deliveryCountry} onChange={(code) => setAnswer("deliveryCountry", code)} />
      ),
    },
    {
      id: "deliveryCity",
      title: "City/Region",
      kind: "text",
      field: "deliveryCityRegion",
      prompt: "City / region?",
      placeholder: "e.g., Abidjan",
    },
    {
      id: "deliveryAddress",
      title: "Address",
      kind: "textarea",
      field: "deliveryAddress",
      prompt: "Address?",
      placeholder: "Street, building, and any useful directions",
    },
    {
      id: "timeline",
      title: "Timeline",
      kind: "text",
      field: "timelineNeeded",
      prompt: "Timeline?",
      placeholder: "e.g., 8 weeks",
    },
    {
      id: "notes",
      title: "Notes",
      kind: "textarea",
      field: "notes",
      prompt: "Notes? (optional)",
      required: false,
      placeholder: "Add specs or constraints",
    },
    {
      id: "review",
      title: "Review",
      kind: "review",
      prompt: "Review your request, then submit.",
      renderSummary: (a) => (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[12px] text-white/75 space-y-2">
          <p className="text-sm font-semibold text-white">Summary</p>
          <p>Category: {a.category}</p>
          <p>Condition: {a.conditionPreference}</p>
          <p>Equipment: {a.name}</p>
          <p>Capacity: {a.targetCapacity}</p>
          <p>Power: {a.powerSource}</p>
          <p>
            Budget: {a.budgetMin}–{a.budgetMax} {a.budgetCurrency}
          </p>
          <p>
            Delivery: {[a.deliveryCountry, a.deliveryCityRegion].filter(Boolean).join(", ")}
          </p>
          <p>Address: {a.deliveryAddress}</p>
          <p>Timeline: {a.timelineNeeded}</p>
          {a.notes ? <p>Notes: {a.notes}</p> : null}
        </div>
      ),
    },
  ];

  const mineRegistrationSteps: ChatWizardStep<any>[] = [
    {
      id: "licenseIssuedDate",
      title: "Issued Date",
      kind: "text",
      field: "licenseIssuedDate",
      prompt: "License issued date?",
      placeholder: "YYYY-MM-DD",
    },
    {
      id: "licenseExpiryDate",
      title: "Expiry Date",
      kind: "text",
      field: "licenseExpiryDate",
      prompt: "License expiry date?",
      placeholder: "YYYY-MM-DD",
    },
    {
      id: "licenseHolderName",
      title: "Holder",
      kind: "text",
      field: "licenseHolderName",
      prompt: "License holder name?",
      placeholder: "Name on the license",
    },
    {
      id: "operationsStart",
      title: "Operations",
      kind: "text",
      field: "operationsStartDate",
      prompt: "Operations start date?",
      placeholder: "YYYY-MM-DD",
    },
    {
      id: "miningMethod",
      title: "Method",
      kind: "cards",
      field: "miningMethod",
      prompt: "Mining method?",
      options: [
        { value: "artisanal", title: "Artisanal" },
        { value: "semi_industrial", title: "Semi-industrial" },
        { value: "industrial", title: "Industrial" },
      ],
    },
    {
      id: "totalExtractedKg",
      title: "Total Extracted",
      kind: "text",
      field: "totalExtractedKg",
      prompt: "Total extracted (kg)?",
      inputMode: "decimal",
    },
    {
      id: "last12MonthsKg",
      title: "Last 12 Months",
      kind: "text",
      field: "last12MonthsKg",
      prompt: "Last 12 months production (kg)?",
      inputMode: "decimal",
    },
    {
      id: "typicalMonthlyKg",
      title: "Monthly Typical",
      kind: "text",
      field: "typicalMonthlyKg",
      prompt: "Typical monthly production (kg)?",
      inputMode: "decimal",
    },
    {
      id: "amountNeededUsd",
      title: "Amount Needed",
      kind: "text",
      field: "amountNeededUsd",
      prompt: "Amount needed (USD)?",
      inputMode: "decimal",
    },
    {
      id: "timeline",
      title: "Timeline",
      kind: "text",
      field: "timeline",
      prompt: "Timeline?",
      placeholder: "e.g., 8 weeks",
    },
    {
      id: "returnModel",
      title: "Return Model",
      kind: "cards",
      field: "preferredReturnModel",
      prompt: "Preferred return model (label)?",
      options: [
        { value: "Return per rotation", title: "Return per rotation" },
        { value: "Production share", title: "Production share" },
        { value: "Offtake-linked premium", title: "Offtake-linked premium" },
      ],
    },
    {
      id: "notes",
      title: "Notes",
      kind: "textarea",
      field: "notes",
      prompt: "Notes? (optional)",
      required: false,
      placeholder: "Add context or documentation notes",
    },
    {
      id: "review",
      title: "Review",
      kind: "review",
      prompt: "Review your mine registration, then submit.",
      renderSummary: (a) => (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[12px] text-white/75 space-y-2">
          <p className="text-sm font-semibold text-white">Summary</p>
          <p>Mine: {a.legalName}</p>
          <p>Location: {[a.country, a.region].filter(Boolean).join(", ")}</p>
          <p>GPS: {a.lat}, {a.lng}</p>
          <p>License: {a.licenseType} · {a.licenseNumber}</p>
          <p>Issued: {a.licenseIssuedDate} · Expires: {a.licenseExpiryDate}</p>
          <p>Holder: {a.licenseHolderName}</p>
          <p>Operations start: {a.operationsStartDate}</p>
          <p>Method: {a.miningMethod}</p>
          <p>Production (kg): total {a.totalExtractedKg}, 12m {a.last12MonthsKg}, monthly {a.typicalMonthlyKg}</p>
          <p>Amount needed: {a.amountNeededUsd} USD</p>
          <p>Timeline: {a.timeline}</p>
          <p>Return model: {a.preferredReturnModel}</p>
          {a.notes ? <p>Notes: {a.notes}</p> : null}
        </div>
      ),
    },
  ];

  useEffect(() => {
    if (!selectedShop) return;
    setShopProductCategory("all");
  }, [selectedShop]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferSearchResults, setTransferSearchResults] = useState<{id: number; email: string; displayName: string | null}[]>([]);
  const [transferSearching, setTransferSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const checkoutEndRef = useRef<HTMLDivElement>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultPane, setVaultPane] = useState<"wallet" | "vault">("wallet");
  const [bdoPurchaseOpen, setBdoPurchaseOpen] = useState(false);
  const [bdoSecondaryOpen, setBdoSecondaryOpen] = useState(false);
	  const [bdoPurchaseUnitSize, setBdoPurchaseUnitSize] = useState<number>(20);
	  const [bdoPurchaseDeliveryNow, setBdoPurchaseDeliveryNow] = useState(false);
	  const [bdoPurchaseLockupEndDate, setBdoPurchaseLockupEndDate] = useState("");
	  const [walletTopupAutoOpen, setWalletTopupAutoOpen] = useState(false);

	  useEffect(() => {
	    safeLocalStorageSet("buyer_mode", buyerMode);
    // Doré is wholesale-only (compliance). Machinery/Investments are informational modules and can be used in retail.
    if (buyerMode === "retail" && marketMode === "dore") {
      safeLocalStorageSet("market_mode", "marketplace");
      setMarketMode("marketplace");
      return;
    }
    if (!isGoldTenant && (marketMode === "machinery" || marketMode === "investments")) {
      safeLocalStorageSet("market_mode", "marketplace");
      setMarketMode("marketplace");
      return;
    }

    safeLocalStorageSet("market_mode", marketMode);

    if (isGoldTenant && marketMode === "dore" && selectedCategory && !MODE_CATEGORIES[buyerMode].includes(selectedCategory as any)) {
      setSelectedCategory(null);
    }
  }, [buyerMode, selectedCategory, marketMode, isGoldTenant]);

  useEffect(() => {
    if (!isGoldTenant) return;
    if (marketMode !== "dore") return;
    if (buyerMode === "wholesale") {
      setSelectedCategory("dore");
    } else if (buyerMode === "retail") {
      if (!selectedCategory) setSelectedCategory("stamped");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerMode, marketMode, isGoldTenant]);

  useEffect(() => {
    const fromUser = session.user?.buyerType;
    if (forcedBuyerMode) return;
    if (fromUser === "wholesale" || fromUser === "retail") {
      setBuyerMode(fromUser);
      safeLocalStorageSet("buyer_mode", fromUser);
    }
  }, [session.user?.buyerType, forcedBuyerMode]);

  useEffect(() => {
    if (!forcedBuyerMode) return;
    setBuyerMode(forcedBuyerMode);
    safeLocalStorageSet("buyer_mode", forcedBuyerMode);
  }, [forcedBuyerMode]);

  const { data: marketplaceCategories = [] } = useQuery({
    queryKey: ["/api/marketplace/product-categories"],
    enabled: !isGoldTenant,
  });

  const categoryMetaMap: Record<string, CategoryMeta> = isGoldTenant
    ? {
        ...GOLD_CATEGORY_META,
        dore: { ...GOLD_CATEGORY_META.dore, label: t("product.dore") },
        stamped: { ...GOLD_CATEGORY_META.stamped, label: t("sections.stamped.title") },
        jewelry: { ...GOLD_CATEGORY_META.jewelry, label: t("sections.jewelry.title") },
        "gold-art": { ...GOLD_CATEGORY_META["gold-art"], label: t("sections.goldArt.title") },
      }
    : (() => {
        const marketplaceLabel = t("nav.marketplace");
        const fallbackVisual = getCategoryVisual(tenant.key, "default");
        const fallbackImage = fallbackVisual?.image || tenantPlaceholderProductImage;
        const map: Record<string, CategoryMeta> = {};
        for (const cat of marketplaceCategories as Array<any>) {
          const slug = String(cat?.slug || "").trim();
          if (!slug) continue;
          const visual = getCategoryVisual(tenant.key, slug);
          const icon = String(visual?.icon || cat?.icon || categoryIcons[slug] || categoryIcons.default || "");
          const accent = String(visual?.accent || cat?.color || categoryColors[slug] || categoryColors.default || "#F59E0B");
          map[slug] = {
            label: String(visual?.label || cat?.name || slug),
            icon,
            image: String(visual?.image || fallbackImage),
            accent,
          };
        }
        if (!Object.keys(map).length) {
          map.default = {
            label: String(fallbackVisual?.label || marketplaceLabel),
            icon: String(fallbackVisual?.icon || categoryIcons.default || ""),
            image: fallbackImage,
            accent: String(fallbackVisual?.accent || categoryColors.default || "#F59E0B"),
          };
        }
        return map;
      })();

  const getCategoryMeta = (slug: string | null | undefined): CategoryMeta => {
    const key = slug || "default";
    const marketplaceLabel = t("nav.marketplace");
    return (
      categoryMetaMap[key] || {
        label: String(getCategoryVisual(tenant.key, key)?.label || slug || marketplaceLabel),
        icon: String(getCategoryVisual(tenant.key, key)?.icon || categoryIcons[key] || categoryIcons.default || ""),
        image: String(getCategoryVisual(tenant.key, key)?.image || tenantPlaceholderProductImage),
        accent: String(getCategoryVisual(tenant.key, key)?.accent || categoryColors[key] || categoryColors.default || "#F59E0B"),
      }
    );
  };

  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ["/api/marketplace/buyer/wallet", session.token, session.guestSessionId],
    queryFn: async () => {
      try {
        const headers: Record<string, string> = {};
        if (session.guestSessionId) {
          headers['x-guest-session'] = session.guestSessionId;
        }
        if (session.token) {
          headers['Authorization'] = `Bearer ${session.token}`;
        }
        Object.assign(headers, getDemoModeHeaders());
        const res = await fetch(resolveApiUrl("/api/marketplace/buyer/wallet"), { headers });
        if (!res.ok) {
          return { wallet: { balance: "0.00", totalDeposited: "0.00", totalSpent: "0.00" }, recentTransactions: [] };
        }
        return res.json();
      } catch (error) {
        console.error("Wallet fetch error:", error);
        return { wallet: { balance: "0.00", totalDeposited: "0.00", totalSpent: "0.00" }, recentTransactions: [] };
      }
    },
    staleTime: 30000,
    retry: 1
  });

	  const { data: vaultData, isLoading: vaultLoading } = useQuery({
	    queryKey: ["/api/gold-exchange/bdo/vault", session.token],
	    queryFn: async () => {
      try {
        if (!session.token) return null;
        const res = await fetch(resolveApiUrl("/api/gold-exchange/bdo/vault"), {
          headers: { ...getDemoModeHeaders(), Authorization: `Bearer ${session.token}` },
        });
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: !!session.token && session.isAuthenticated && !session.isGuest,
    staleTime: 30000,
	    retry: 1,
	  });

	  const { data: walletSummary, isLoading: walletSummaryLoading } = useQuery({
	    queryKey: ["/api/wallet/summary", session.token, session.guestSessionId],
	    queryFn: async () => {
	      try {
	        const headers: Record<string, string> = {};
	        if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;
	        if (session.token) headers["Authorization"] = `Bearer ${session.token}`;
	        Object.assign(headers, getDemoModeHeaders());
	        const res = await fetch(resolveApiUrl("/api/wallet/summary"), { headers, credentials: "include" });
	        if (!res.ok) return null;
	        return res.json();
	      } catch {
	        return null;
	      }
	    },
	    staleTime: 30000,
	    retry: 1,
	  });
	
	  const { data: bdoUnitDefs } = useQuery({
	    queryKey: ["/api/gold-exchange/bdo/unit-definitions"],
	    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/gold-exchange/bdo/unit-definitions"), { headers: getDemoModeHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

	  const bdoPurchaseMutation = useMutation({
	    mutationFn: async () => {
	      if (!session.token) throw new Error("Authentication required");
	      const lockupEndDate = bdoPurchaseLockupEndDate ? new Date(bdoPurchaseLockupEndDate) : null;
      return apiRequest("/api/gold-exchange/bdo/purchase", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          unitSizeGrams: bdoPurchaseUnitSize,
          currency: "XOF",
          deliveryNow: bdoPurchaseDeliveryNow,
          lockupEndDate: lockupEndDate ? lockupEndDate.toISOString() : null,
          destination: {},
        }),
      });
    },
	    onSuccess: () => {
	      toast({ title: t("vault.purchaseSuccess"), description: t("vault.purchaseSuccessDetail") });
	      setBdoPurchaseOpen(false);
	      queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/vault"] });
	      queryClient.invalidateQueries({ queryKey: ["/api/wallet/summary"] });
	    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error?.message || t("vault.purchaseFailed"), variant: "destructive" });
    },
  });

  const bdoRequestDeliveryMutation = useMutation({
    mutationFn: async (unitId: number) => {
      if (!session.token) throw new Error("Authentication required");
      return apiRequest(`/api/gold-exchange/bdo/vault/${unitId}/request-delivery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ destination: {} }),
      });
    },
    onSuccess: () => {
      toast({ title: t("vault.deliveryRequested"), description: t("vault.deliveryRequestedDetail") });
      queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/vault"] });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error?.message || t("vault.deliveryRequestFailed"), variant: "destructive" });
    },
  });

  const bdoAuthorizeResaleMutation = useMutation({
    mutationFn: async (unitId: number) => {
      if (!session.token) throw new Error("Authentication required");
      return apiRequest(`/api/gold-exchange/bdo/vault/${unitId}/authorize-resale`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      toast({ title: t("vault.resaleAuthorized"), description: t("vault.resaleAuthorizedDetail") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error?.message || t("vault.resaleAuthorizeFailed"), variant: "destructive" });
    },
  });

  const bdoCreateListingMutation = useMutation({
    mutationFn: async (unitId: number) => {
      if (!session.token) throw new Error("Authentication required");
      return apiRequest("/api/gold-exchange/bdo/secondary-market/listings", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ unitId }),
      });
    },
    onSuccess: () => {
      toast({ title: t("vault.listingCreated"), description: t("vault.listingCreatedDetail") });
      queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/vault"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/secondary-market/listings"] });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error?.message || t("vault.listingCreateFailed"), variant: "destructive" });
    },
  });

  const { data: bdoListingsData, isLoading: bdoListingsLoading, error: bdoListingsError } = useQuery({
    queryKey: ["/api/gold-exchange/bdo/secondary-market/listings", session.token],
    queryFn: async () => {
      if (!session.token) return { listings: [] };
      const res = await fetch(resolveApiUrl("/api/gold-exchange/bdo/secondary-market/listings"), {
        headers: { ...getDemoModeHeaders(), Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = (data as any)?.message || "Secondary market access denied";
        throw new Error(message);
      }
      return data;
    },
    enabled: bdoSecondaryOpen && !!session.token && session.isAuthenticated && !session.isGuest,
    staleTime: 20000,
    retry: 0,
  });

  const bdoBuyListingMutation = useMutation({
    mutationFn: async (listingId: number) => {
      if (!session.token) throw new Error("Authentication required");
      return apiRequest(`/api/gold-exchange/bdo/secondary-market/listings/${listingId}/buy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ deliveryNow: false, destination: {} }),
      });
    },
	    onSuccess: () => {
	      toast({ title: t("secondaryMarket.purchaseSuccess"), description: t("secondaryMarket.purchaseSuccessDetail") });
	      queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/vault"] });
	      queryClient.invalidateQueries({ queryKey: ["/api/wallet/summary"] });
	      queryClient.invalidateQueries({ queryKey: ["/api/gold-exchange/bdo/secondary-market/listings"] });
	    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error?.message || t("secondaryMarket.purchaseFailed"), variant: "destructive" });
    },
  });

  const { data: goldPrice } = useQuery({
    queryKey: ["/api/marketplace/gold-price"],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/marketplace/gold-price"), { headers: getDemoModeHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000
  });

  const { data: platformStats } = useQuery({
    queryKey: ["/api/gold-exchange/platform-stats"],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/gold-exchange/platform-stats"), { headers: getDemoModeHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60000
  });

  const cadastreMapResponse = useQuery<{ items?: CadastreMapApiItem[] }>({
    queryKey: [
      "/api/cadastre/map",
      investmentFilters.country,
      investmentFilters.region,
      investmentFilters.query,
    ],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("country", "CI");
      qs.set("status", "VERIFIED,PENDING,INACTIVE");
      qs.set("limit", "1000");
      if (investmentFilters.query) qs.set("q", investmentFilters.query);
      if (investmentFilters.region !== "all") qs.set("region", investmentFilters.region);
      return apiRequest(`/api/cadastre/map?${qs.toString()}`);
    },
    staleTime: 60_000,
  });

  const cadastreOpportunitiesResponse = useQuery<{ items?: CadastreOpportunityApiItem[] }>({
    queryKey: [
      "/api/cadastre/opportunities",
      investmentFilters.country,
      investmentFilters.region,
      investmentFilters.query,
    ],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("country", "CI");
      qs.set("status", "VERIFIED,PENDING");
      qs.set("limit", "220");
      if (investmentFilters.query) qs.set("q", investmentFilters.query);
      if (investmentFilters.region !== "all") qs.set("region", investmentFilters.region);
      return apiRequest(`/api/cadastre/opportunities?${qs.toString()}`);
    },
    staleTime: 60_000,
  });

  const cadastreMapItems = useMemo(
    () =>
      (Array.isArray(cadastreMapResponse.data?.items) ? cadastreMapResponse.data!.items : []).filter(
        (item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)),
      ),
    [cadastreMapResponse.data],
  );

  const liveCadastreOpportunities = useMemo(
    () => (Array.isArray(cadastreOpportunitiesResponse.data?.items) ? cadastreOpportunitiesResponse.data!.items : []),
    [cadastreOpportunitiesResponse.data],
  );

  const liveCadastreByMineId = useMemo(() => {
    const map = new Map<string, CadastreOpportunityApiItem>();
    for (const item of liveCadastreOpportunities) {
      map.set(`cadastre-site-${item.id}`, item);
    }
    return map;
  }, [liveCadastreOpportunities]);

  const resolveMineForOpportunity = useCallback(
    (opportunity: InvestmentOpportunity | null) => {
      if (!opportunity) return null;
      const live = liveCadastreByMineId.get(opportunity.mineId);
      if (!live) return getMineById(opportunity.mineId);

      const region = String(live.region || "Unknown");
      const currentCapacityKgPerMonth = Number(live.current_capacity_kg_month || 0);
      const production30dG = Number(live.production_30d_g || 0);
      const monthlyFromProduction = production30dG > 0 ? production30dG / 1000 : 0;
      const effectiveCapacity = currentCapacityKgPerMonth > 0 ? currentCapacityKgPerMonth : monthlyFromProduction;
      const annualKg = effectiveCapacity > 0 ? Math.round(effectiveCapacity * 12) : 0;
      const issuedAtIso = live.last_report_date || new Date().toISOString();
      const issuedYear = new Date(issuedAtIso).getUTCFullYear();
      const permitNumber = String(live.permit_number || "").trim();
      const cadastreName = String(live.cadastre_name || "").trim() || "MISSING CADASTRE NAME - FIX";
      const status = normalizeCadastreStatus(live.status);

      return {
        id: opportunity.mineId,
        legalName: cadastreName,
        country: "Cote d'Ivoire",
        region,
        locality: region,
        lat: Number(live.lat || 0),
        lng: Number(live.lng || 0),
        licenseType: String(live.site_type || "UNKNOWN"),
        licenseNumber: permitNumber || "UNKNOWN",
        licenseIssuedDate: issuedAtIso,
        licenseExpiryDate: "",
        licenseActiveSinceYear: Number.isFinite(issuedYear) ? issuedYear : new Date().getUTCFullYear(),
        verificationStatus: cadastreStatusToMineVerification(status),
        publicVisible: true,
        historicalProductionTotalKg: annualKg,
        historicalProductionLast12MonthsKg: annualKg,
        currentCapacityKgPerMonth: Math.round(effectiveCapacity),
        remainingPotential: status === "VERIFIED" ? "high" : status === "INACTIVE" ? "low" : "medium",
        remainingLifeYearsAtCurrentRate:
          live.duration_months != null ? Math.max(1, Math.round(Number(live.duration_months) / 12)) : undefined,
        cadastre: {
          cadastreCountry: "Cote d'Ivoire",
          cadastreSourceUrl: String(live.id || ""),
          permitId: permitNumber || "UNKNOWN",
          permitType: String(live.site_type || "UNKNOWN"),
          permitStatus: cadastreStatusToPermitStatus(status),
          commodity: "Gold",
          geometryHash: String(live.id || ""),
          lastSyncAt: issuedAtIso,
        },
        cadastreClaimStatus: status === "VERIFIED" ? "verified" : "pending",
      } as any;
    },
    [liveCadastreByMineId],
  );

  const resolveCadastrePermitForMine = useCallback(
    (mine: any): CadastrePermit | null => {
      if (!mine) return null;
      const live = liveCadastreByMineId.get(String(mine.id || ""));
      if (!live) return getCadastrePermitForMine(mine);

      const lat = Number(live.lat || 0);
      const lng = Number(live.lng || 0);
      const geometry = makeFallbackPermitPolygon(lat, lng);
      const permitId = String(live.permit_number || "").trim() || `CI-${String(live.id || "").slice(0, 8)}`;
      const status = normalizeCadastreStatus(live.status);
      const permitStatus = cadastreStatusToPermitStatus(status);

      return {
        permitId,
        country: "Cote d'Ivoire",
        region: String(live.region || mine?.region || "Unknown"),
        holderName: String(live.cadastre_name || "").trim() || "MISSING CADASTRE NAME - FIX",
        permitType: String(live.site_type || "UNKNOWN"),
        permitStatus,
        commodity: "Gold",
        sourceUrl:
          String(live.id || "").startsWith("http")
            ? String(live.id)
            : "https://portals.landfolio.com/CoteDIvoire/FR/",
        geometry,
        centroid: { lat, lng },
        geometryHash: String(live.id || permitId),
        lastSyncAt: String(live.last_report_date || new Date().toISOString()),
        licenseActiveSinceYear:
          Number.isFinite(new Date(String(live.last_report_date || "")).getUTCFullYear())
            ? new Date(String(live.last_report_date)).getUTCFullYear()
            : new Date().getUTCFullYear(),
      };
    },
    [liveCadastreByMineId],
  );

  const selectedMine = selectedOpportunity ? resolveMineForOpportunity(selectedOpportunity) : null;
  const selectedCadastrePermit = selectedMine ? resolveCadastrePermitForMine(selectedMine) : null;
  const selectedCadastreOk = isCadastrePermitValid(selectedCadastrePermit);
  const selectedCadastreSource = selectedMine ? getCadastreSourceForCountry(selectedMine.country) : null;
  const selectedCadastreVerified = selectedMine ? isMineCadastreVerified(selectedMine) : false;
  const selectedMineRegion = selectedMine?.region || selectedOpportunity?.location.region || null;
  const { data: authorizedBureaus, isLoading: authorizedBureausLoading } = useQuery({
    queryKey: ["/api/gold-exchange/bureaus", "CI", selectedMineRegion],
    queryFn: async () => {
      if (!selectedMineRegion) return [];
      const res = await fetch(
        resolveApiUrl(
          `/api/gold-exchange/bureaus?country=CI&region=${encodeURIComponent(selectedMineRegion)}&authorizedOnly=true`,
        ),
        { headers: getDemoModeHeaders() },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedMineRegion,
    staleTime: 60000,
  });

  const formatCoordsLabel = (lat: number, lng: number, precision = 2) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    const digits = Math.max(0, Math.min(Math.trunc(precision), 6));
    return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
  };

  const activeLocationLabel = (() => {
    const fromGeo = activeGeo.city?.name
      ? `${activeGeo.city.name}${activeGeo.country?.name ? `, ${activeGeo.country.name}` : ""}`
      : activeGeo.country?.name || "";
    if (fromGeo) return fromGeo;

    const override = locationLabelOverride.trim();
    if (override) return override;

    const coords = formatCoordsLabel(userPosition[0], userPosition[1], locationSource === "gps" ? 3 : 2);
    if (!coords) return "";
    const sourceLabel = locationSource === "gps" ? "GPS" : locationSource === "manual" ? "Manual" : "Approx";
    return `${sourceLabel}: ${coords}`;
  })();

  const resolveCoords = async (
    lat: number,
    lng: number,
    source: ActiveGeo["source"],
    opts?: { labelOverride?: string | null },
  ) => {
    const explicitLabel = typeof opts?.labelOverride === "string" ? opts.labelOverride.trim() : "";
    const sourceLabel = source === "gps" ? "GPS" : source === "manual" ? "Manual" : source === "ip" ? "Approx" : "Location";

    try {
      const res = await fetch(
        resolveApiUrl(`/api/marketplace/geo/resolve?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`),
        { headers: getDemoModeHeaders() },
      );
      if (!res.ok) throw new Error("resolve_failed");
      const resolved = await res.json();
      const next: ActiveGeo = {
        country: resolved.country || null,
        region: resolved.region || null,
        city: resolved.city || null,
        source,
      };
      const resolvedCountryCode = String(resolved?.country?.code || "")
        .trim()
        .toUpperCase();
      const resolvedLabel = resolved?.city?.name
        ? `${resolved.city.name}${resolved?.country?.name ? `, ${resolved.country.name}` : ""}`
        : resolved?.country?.name
          ? String(resolved.country.name)
          : "";

      const label = resolvedLabel || explicitLabel;

      setActiveGeo(next);
      setLocationLabelOverride(label);
      if (resolvedCountryCode) {
        applyAutoLocaleFromCountry(resolvedCountryCode);
      }
      try {
        localStorage.setItem(
          "marketplace_location_v1",
          JSON.stringify({
            lat,
            lng,
            label,
            country: resolved.country || null,
            region: resolved.region || null,
            city: resolved.city || null,
            source,
          }),
        );
      } catch {
        // ignore
      }
      return true;
    } catch {
      const coords = formatCoordsLabel(lat, lng, source === "gps" ? 3 : 2);
      const label = explicitLabel || (coords ? `${sourceLabel}: ${coords}` : sourceLabel);
      setActiveGeo({ country: null, region: null, city: null, source });
      setLocationLabelOverride(label);
      try {
        localStorage.setItem(
          "marketplace_location_v1",
          JSON.stringify({ lat, lng, label, country: null, region: null, city: null, source }),
        );
      } catch {
        // ignore
      }
      return false;
    }
  };

  const lastResolvedCoordsAtRef = useRef<number | null>(null);

  const startLiveGpsWatch = () => {
    startBdoWatch(async (update) => {
      if (update.location.source !== "gps") return;
      setLocationSource("gps");
      setUserPosition([update.location.lat, update.location.lon]);

      const lastResolvedAt = lastResolvedCoordsAtRef.current;
      if (!lastResolvedAt || Date.now() - lastResolvedAt > 5 * 60_000) {
        lastResolvedCoordsAtRef.current = Date.now();
        await resolveCoords(update.location.lat, update.location.lon, "gps");
      }
    });
  };

  const applyLocationResult = async (
    result: LocationResult,
    opts?: { silent?: boolean; allowWatch?: boolean; labelOverride?: string | null },
  ) => {
    const loc = result.location;
    setLocationPermissionState(result.permission);
    setLocationUsedFallback(result.usedFallback);
    setLocationLastError(result.error ?? null);
    setLocationSource(loc.source);
    setUserPosition([loc.lat, loc.lon]);
    if (loc.source !== "manual" && !opts?.labelOverride) setLocationLabelOverride("");

    if (!radiusCustomized) {
      setRadiusKm(loc.source === "gps" ? 30 : 100);
    }

    await resolveCoords(loc.lat, loc.lon, loc.source, { labelOverride: opts?.labelOverride ?? null });

    if (loc.source === "gps" && opts?.allowWatch !== false) {
      startLiveGpsWatch();
    } else {
      stopBdoWatch();
    }

    if (result.usedFallback && loc.source === "ip" && !opts?.silent) {
      if (!locationToastShownRef.current) {
        locationToastShownRef.current = true;
        toast({
          title: t("location.approx.title"),
          description: t("location.approx.description"),
        });
      }
    }
  };

  const markLocationPromptDone = () => {
    try {
      localStorage.setItem(LOCATION_PROMPT_DONE_KEY, "true");
    } catch {
      // ignore
    }
  };

  const dismissLocationPrompt = () => {
    markLocationPromptDone();
    setLocationPromptOpen(false);
    setLocationPromptMode("prompt");
  };

  const handleUseApproxLocation = async () => {
    const fallback = await getBdoLocation({ force: false });
    await applyLocationResult(fallback, { silent: false, allowWatch: false });
    dismissLocationPrompt();
  };

  const handleUseManualLocation = async (preset = DEFAULT_MANUAL_LOCATION) => {
    const permission = await getPermissionState();
    const manual: LocationResult = {
      location: {
        lat: preset.lat,
        lon: preset.lon,
        accuracy: null,
        ts: Date.now(),
        source: "manual",
      },
      permission,
      usedFallback: false,
    };
    await applyLocationResult(manual, { silent: false, allowWatch: false, labelOverride: preset.label });
    dismissLocationPrompt();
  };

  const handleEnableLocation = async () => {
    if (locationRequesting) return;
    setLocationRequesting(true);
    try {
      const result = await getBdoLocation({ force: true, highAccuracy: true });
      await applyLocationResult(result, { silent: false, allowWatch: true });

      if (result.error?.kind === "permission_denied") {
        setLocationPromptMode("denied");
        return;
      }
      if (result.error) {
        setLocationPromptMode("error");
        return;
      }

      dismissLocationPrompt();
    } finally {
      setLocationRequesting(false);
    }
  };

  useEffect(() => {
    if (tenant.key === "exportunity") {
      document.title = `${retailModeLabel} — Exportunity`;
      return;
    }
    document.title = formatPageTitle(retailModeLabel || t("nav.marketplace"), brand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, brand, tenant.key, t, retailModeLabel]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const permission = await getPermissionState();
      if (cancelled) return;
      const fallback = await getBdoLocation({ force: false });
      if (cancelled) return;
      await applyLocationResult(fallback, { silent: true, allowWatch: permission === "granted" });

      if (permission === "granted" && fallback.location.source !== "gps") {
        const upgraded = await getBdoLocation({ force: true });
        if (cancelled) return;
        await applyLocationResult(upgraded, { silent: true, allowWatch: true });
      }
    };

    init().catch(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
      stopBdoWatch();
    };
  }, []);

  useEffect(() => {
    if (!conciergeOpen) {
      setKeyboardInsetPx(0);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInsetPx(Math.round(inset));
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [conciergeOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    checkoutEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [checkoutMessages]);

  const startCheckout = () => {
    const shopIds = [...new Set(cart.map(item => item.shopId))];
    if (shopIds.length > 1) {
      toast({
        title: "Multiple producers",
        description: "Please order from one producer at a time. Remove items from other producers first.",
        variant: "destructive"
      });
      return;
    }
    
    const checkoutTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    setCheckoutOpen(true);
    setCheckoutStep(0);
    setCheckoutMessages([
      { role: "assistant", content: `Great! Let's complete your order of ${cart.length} item${cart.length > 1 ? 's' : ''} totaling ${formatMoney(checkoutTotal, "XOF")}. First, tell me about yourself - who is placing this order?` }
    ]);
    setCartOpen(false);
  };

  const handleCheckoutResponse = (response: string, nextStep: number) => {
    const orderTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const walletBalance = Number(walletData?.wallet?.balance || 0);
    
    setCheckoutMessages(prev => [...prev, { role: "user", content: response }]);
    
    setTimeout(() => {
      let assistantMessage = "";
      
      if (nextStep === 1) {
        setCheckoutData(prev => ({ ...prev, buyerType: response }));
        if (response === "Business") {
          assistantMessage = "Perfect! What's your company or business name?";
        } else {
          setCheckoutData(prev => ({ ...prev, companyName: "Individual Buyer" }));
          assistantMessage = `Now, how would you like to pay? Your wallet balance is ${formatMoney(walletBalance, walletData?.wallet?.currency)} and your order total is ${formatMoney(orderTotal, "XOF")}.`;
          nextStep = 2;
        }
      } else if (nextStep === 2) {
        if (checkoutData.buyerType === "Business") {
          setCheckoutData(prev => ({ ...prev, companyName: response }));
        }
        assistantMessage = `Now, how would you like to pay? Your wallet balance is ${formatMoney(walletBalance, walletData?.wallet?.currency)} and your order total is ${formatMoney(orderTotal, "XOF")}.`;
      } else if (nextStep === 3) {
        setCheckoutData(prev => ({ ...prev, paymentMethod: response }));
        if (response === "ECE Wallet" && walletBalance < orderTotal) {
          const needed = orderTotal - walletBalance;
          assistantMessage = `You need ${formatMoney(needed, walletData?.wallet?.currency)} more in your wallet. How much would you like to deposit?`;
        } else if (response === "ECE Wallet") {
          assistantMessage = `Excellent! Your wallet has sufficient funds. Ready to confirm your order of ${formatMoney(orderTotal, "XOF")}?`;
          nextStep = 5;
        } else {
          assistantMessage = `You've selected ${response}. Ready to confirm your order of ${formatMoney(orderTotal, "XOF")}?`;
          nextStep = 5;
        }
      } else if (nextStep === 4) {
        const amount = parseInt(response.replace(/[^0-9]/g, '')) || 0;
        setCheckoutData(prev => ({ ...prev, depositAmount: amount }));
        assistantMessage = `Great! You'll deposit ${formatMoney(amount, walletData?.wallet?.currency)} to your wallet. Ready to confirm your order?`;
        nextStep = 5;
      } else if (nextStep === 5) {
        assistantMessage = "Processing your order...";
      }
      
      setCheckoutMessages(prev => [...prev, { role: "assistant", content: assistantMessage }]);
      setCheckoutStep(nextStep);
    }, 500);
  };

  const confirmOrder = () => {
    if (cartHasStamped && !pickupPartnerId) {
      toast({
        title: "Pickup location required",
        description: "Select a partner jeweller for stamped gold pickup.",
        variant: "destructive",
      });
      return;
    }
    const shopGroups = cart.reduce((acc, item) => {
      if (!acc[item.shopId]) acc[item.shopId] = [];
      acc[item.shopId].push({ productId: item.productId, quantity: item.quantity });
      return acc;
    }, {} as Record<number, { productId: number; quantity: number }[]>);
    
    const sellerId = parseInt(Object.keys(shopGroups)[0]);
    orderMutation.mutate({ sellerId, items: shopGroups[sellerId], pickupPartnerId: cartHasStamped ? pickupPartnerId : undefined });
  };

  const { data: wholesaleGoldAccess } = useQuery<{
    marketKey: string;
    status: "none" | "pending" | "approved" | "rejected";
    request: any | null;
  }>({
    queryKey: ["/api/marketplace/markets/wholesale-gold/access", session.token],
    queryFn: async () => {
      if (!session.token) return { marketKey: "wholesale_gold", status: "none", request: null };
      const res = await fetch(resolveApiUrl("/api/marketplace/markets/wholesale-gold/access"), {
        headers: { ...getDemoModeHeaders(), Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) return { marketKey: "wholesale_gold", status: "none", request: null };
      return res.json();
    },
    enabled: !!session.token,
    staleTime: 30_000,
  });

  const wholesaleGoldAccessStatus: "none" | "pending" | "approved" | "rejected" =
    session.hasRole("admin")
      ? "approved"
      : wholesaleGoldAccess?.status || (session.user?.buyerType === "wholesale" ? "approved" : "none");

  const isWholesaleAuthorized =
    session.isAuthenticated && (session.hasRole("admin") || wholesaleGoldAccessStatus === "approved");
  const isWholesalePreview = buyerMode === "wholesale" && !isWholesaleAuthorized;
  const isWholesaleAccessPending = session.isAuthenticated && wholesaleGoldAccessStatus === "pending";

  const requestWholesaleAccess = useMutation({
    mutationFn: async () => {
      if (!session.token) throw new Error("Authentication required");
      return apiRequest("/api/marketplace/markets/wholesale-gold/access-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({
          marketKey: "wholesale_gold",
          licenseFileName: wholesaleLicenseFileName || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/markets/wholesale-gold/access", session.token] });
      toast({
        title: "Access request submitted",
        description: "Your wholesale gold access request is now queued for admin approval.",
      });
      setWholesaleApplyOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Could not submit request",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: nearbyData, isLoading: nearbyLoading, isFetching: nearbyFetching } = useQuery({
    queryKey: [
      "/api/marketplace/buyer/nearby",
      userPosition[0],
      userPosition[1],
      selectedCategory,
      useProximityRadius ? radiusKm : 0,
      productsPerSeller,
      storefrontMarketType,
    ],
    queryFn: async ({ signal }) => {
      const nearbyRadiusKm = useProximityRadius ? radiusKm : 0;
      const fallback = {
        shops: [],
        userLocation: { lat: userPosition[0], lng: userPosition[1] },
        radius: nearbyRadiusKm,
      };
      const params = new URLSearchParams({
        lat: userPosition[0].toString(),
        lng: userPosition[1].toString(),
        radius: nearbyRadiusKm.toString(),
        ...(selectedCategory && { category: selectedCategory })
      });
      if (productsPerSeller > 0) {
        params.set("productsPerSeller", String(productsPerSeller));
      }
      const res = await fetch(resolveApiUrl(`/api/marketplace/buyer/nearby?${params}`), {
        signal,
        cache: "no-store",
        headers: { ...getDemoModeHeaders(), "x-ece-lang": language },
      });
      if (!res.ok) return { ...fallback, __error: true, __status: res.status };
      try {
        const data = await res.json();
        if (!data || typeof data !== "object") return { ...fallback, __error: true };
        return data;
      } catch {
        return { ...fallback, __error: true };
      }
    },
    enabled: marketMode === "marketplace" || (!isWholesalePreview && marketMode === "dore"),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const { data: whatsappStatus } = useQuery({
    queryKey: ["/api/whatsapp/status"],
    queryFn: async ({ signal }) => {
      const fallback = { ok: false, status: { connected: false } };
      const res = await fetch(resolveApiUrl("/api/whatsapp/status"), { signal, headers: getDemoModeHeaders() });
      if (!res.ok) return fallback;
      try {
        const data = await res.json();
        if (!data || typeof data !== "object") return fallback;
        return data;
      } catch {
        return fallback;
      }
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const whatsappEnabled = whatsappStatus?.status?.connected === true;

  const { data: feedData, isLoading: feedLoading } = useQuery({
    queryKey: ["/api/marketplace/buyer/feed", userPosition[0], userPosition[1]],
    queryFn: async ({ signal }) => {
      const fallback = { categories: [], sections: [] };
      const params = new URLSearchParams({
        lat: userPosition[0].toString(),
        lng: userPosition[1].toString()
      });
      const res = await fetch(resolveApiUrl(`/api/marketplace/buyer/feed?${params}`), {
        signal,
        cache: "no-store",
        headers: { ...getDemoModeHeaders(), "x-ece-lang": language },
      });
      if (!res.ok) return { ...fallback, __error: true, __status: res.status };
      try {
        const data = await res.json();
        if (!data || typeof data !== "object") return { ...fallback, __error: true };
        return data;
      } catch {
        return { ...fallback, __error: true };
      }
    },
    enabled: marketMode === "marketplace" || (!isWholesalePreview && marketMode === "dore"),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const headers: Record<string, string> = {};
      if (session.guestSessionId) headers["x-guest-session"] = session.guestSessionId;
      if (session.token) headers["Authorization"] = `Bearer ${session.token}`;

      return await apiRequest("/api/marketplace/buyer/assistant", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          location: { lat: userPosition[0], lng: userPosition[1] },
          geo: {
            countryId: activeGeo.country?.id,
            countryName: activeGeo.country?.name,
            countryCode: activeGeo.country?.code,
            regionId: activeGeo.region?.id,
            regionName: activeGeo.region?.name,
            cityId: activeGeo.city?.id,
            cityName: activeGeo.city?.name,
            label: activeLocationLabel,
          },
          cart: cart.map(item => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            shopId: item.shopId,
            shopName: item.shopName
          })),
          conversationHistory: chatMessages.slice(-6).map(m => ({
            role: m.role,
            content: m.role === "assistant" ? getConciergeMessageText(m.content) : m.content
          }))
        })
      });
    },
    onSuccess: (data) => {
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: data.response,
        products: data.products,
        actions: data.actions,
        productData: data.productData
      };
      setChatMessages(prev => [...prev, assistantMsg]);

      const searchTerms = getConciergeSearchTerms(data.response);
      if (searchTerms.length) {
        applyFeedIntentFromTerms(searchTerms);
      }
      
      // Handle actions from AI
      if (data.actions && data.actions.length > 0) {
        data.actions.forEach((action: any) => {
          handleAIAction(action, data.productData);
        });
      }
    },
    onError: (error: any) => {
      const raw = error?.message;
      let description = typeof raw === "string" && raw.trim() ? raw : t("chat.failedToGetResponse");
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            if (typeof (parsed as any).error === "string") description = (parsed as any).error;
            else if (typeof (parsed as any).message === "string") description = (parsed as any).message;
          }
        } catch {
          // ignore JSON parse failures
        }
      }
      toast({
        title: t("common.error"),
        description,
        variant: "destructive"
      });
    }
  });

  const handleAIAction = (action: any, productData: Record<number, any>) => {
    const type = String(action?.type || "").toUpperCase();

    switch (type) {
      case "OPEN_CART": {
        setCartOpen(true);
        break;
      }
      case "CLEAR_CART": {
        setCart([]);
        toast({ title: t("cart.empty"), description: t("cart.emptyHelp") });
        break;
      }
      case "REMOVE_FROM_CART": {
        const productId = Number(action?.productId);
        if (Number.isFinite(productId)) removeFromCart(productId);
        break;
      }
      case "SET_CART_QUANTITY": {
        const productId = Number(action?.productId);
        const quantity = Math.floor(Number(action?.quantity));
        if (!Number.isFinite(productId) || !Number.isFinite(quantity)) break;
        if (quantity <= 0) {
          removeFromCart(productId);
          break;
        }
        setCart((prev) =>
          prev.map((item) => (item.productId === productId ? { ...item, quantity } : item)),
        );
        break;
      }
      case "ADD_TO_CART": {
        const productId = Number(action?.productId);
        const quantity = Math.max(1, Math.floor(Number(action?.quantity) || 1));
        if (!Number.isFinite(productId)) break;

        const existingItem = cart.find((item) => item.productId === productId);
        if (existingItem) {
          updateCartQuantity(productId, quantity);
          toast({
            title: t("cart.toast.updatedTitle"),
            description: t("cart.toast.quantityIncreased").replace("{product}", existingItem.name),
          });
          break;
        }

        const product = productData?.[productId];
        if (!product) {
          toast({
            title: t("cart.toast.couldNotAddTitle"),
            description: t("cart.toast.couldNotAddDescription"),
            variant: "destructive",
          });
          break;
        }

        setCart((prev) => [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            price: getCartUnitPrice(product),
            quantity,
            shopId: product.shopId,
            shopName: product.shopName,
          },
        ]);

        toast({
          title: t("cart.toast.addedTitle"),
          description: t("cart.toast.addedDescription").replace("{product}", product.name),
        });
        break;
      }
      case "START_CHECKOUT": {
        if (cart.length > 0) {
          startCheckout();
        } else {
          toast({
            title: t("cart.empty"),
            description: t("cart.emptyHelp"),
            variant: "destructive",
          });
        }
        break;
      }
      case "VIEW_PRODUCT": {
        const productId = Number(action?.productId);
        if (!Number.isFinite(productId)) break;

        const viewProduct = productData?.[productId];
        if (viewProduct) {
          setSelectedProduct(viewProduct);
          break;
        }

        toast({
          title: t("cart.toast.couldNotOpenTitle"),
          description: t("cart.toast.couldNotOpenDescription"),
          variant: "destructive",
        });
        break;
      }
      case "SHOW_CATEGORY": {
        const raw = String(action?.categorySlug || action?.category || "").toLowerCase();
        let next: GoldCategorySlug | null = null;
        if (raw.includes("dore")) next = "dore";
        if (raw.includes("stamp") || raw.includes("bar") || raw.includes("ingot") || raw.includes("lingot")) next = "stamped";
        if (raw.includes("art")) next = "gold-art";
        if (raw.includes("jewel") || raw.includes("heritage")) next = "jewelry";
        if (next) {
          setSelectedCategory(next);
          setSearchQuery("");
        }
        break;
      }
      case "SEARCH_PRODUCTS": {
        const query = String(action?.query || action?.search || action?.term || "").trim();
        if (query) applyFeedIntentFromText(query);
        break;
      }
    }
  };

  const applyFeedIntent = (intent: {
    category?: GoldCategorySlug | null;
    sort?: "default" | "price_asc" | "price_desc" | "distance";
    query?: string;
  }) => {
    if (intent.category !== undefined) setSelectedCategory(intent.category);
    if (intent.sort) setFeedSort(intent.sort);
    if (intent.query !== undefined) setSearchQuery(intent.query);
  };

  const applyFeedIntentFromText = (text: string) => {
    const normalized = normalizeForMatch(text);
    if (!normalized) return;

    const tokens = normalized.split(/\s+/).filter(Boolean);

    let category: GoldCategorySlug | null | undefined;
    if (tokens.some((t) => ["dore", "raw", "lot", "bulk"].includes(t))) {
      category = "dore";
    } else if (tokens.some((t) => ["bar", "bars", "ingot", "lingot", "stamped", "22k", "24k"].includes(t))) {
      category = "stamped";
    } else if (tokens.some((t) => ["art", "bust", "medallion", "relief", "ceremonial", "statue", "sculpture", "object"].includes(t))) {
      category = "gold-art";
    } else if (
      tokens.some((t) =>
        ["jewel", "jewelry", "bijou", "bracelet", "bague", "ring", "chain", "collier", "pendentif", "heritage"].includes(t),
      )
    ) {
      category = "jewelry";
    }

    let sort: "default" | "price_asc" | "price_desc" | "distance" | undefined;
    if (/moins\s*cher|pas\s*cher|cheap|cheapest|lowest|low price/.test(normalized)) {
      sort = "price_asc";
    } else if (/premium|expensive|highest|luxury|haut de gamme/.test(normalized)) {
      sort = "price_desc";
    } else if (/near|nearby|closest|proche|pres|autour/.test(normalized)) {
      sort = "distance";
    }

    const stopwords = new Set([
      "show",
      "find",
      "looking",
      "search",
      "buy",
      "need",
      "want",
      "available",
      "gold",
      "dore",
      "raw",
      "lot",
      "bulk",
      "bar",
      "bars",
      "ingot",
      "lingot",
      "stamped",
      "jewel",
      "jewelry",
      "bijou",
      "bracelet",
      "bague",
      "ring",
      "chain",
      "collier",
      "pendentif",
      "heritage",
      "art",
      "cheap",
      "cheapest",
      "lowest",
      "low",
      "premium",
      "expensive",
      "highest",
      "luxury",
      "near",
      "nearby",
      "closest",
      "proche",
      "pres",
      "autour",
      "moins",
      "cher",
      "pas",
      "prix",
      "price",
      "deliver",
      "delivery",
      "livraison",
      "montre",
      "voir",
      "cherche",
      "vouloir",
      "veux",
      "besoin",
      "acheter",
    ]);

    const cleaned = tokens.filter((t) => !stopwords.has(t));
    const query = cleaned.join(" ");

    applyFeedIntent({
      category,
      sort,
      query: query || (category || sort ? "" : searchQuery),
    });
  };

  const applyFeedIntentFromTerms = (terms: string[]) => {
    if (!terms.length) return;
    applyFeedIntentFromText(terms.join(" "));
  };

  const sendConciergeMessage = (text: string) => {
    const next = text.trim();
    if (!next) return;
    if (isWholesalePreview) {
      setWholesaleApplyOpen(true);
      toast({
        title: "Wholesale preview",
        description: "Apply to unlock access-controlled wholesale counterparties and trading.",
      });
      return;
    }

    applyFeedIntentFromText(next);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: next,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    chatMutation.mutate(next);
    setChatInput("");
  };

  const handleSendChat = () => {
    sendConciergeMessage(chatInput);
  };

  const addToCart = (product: any, shop: any) => {
    if (isWholesalePreview) {
      setWholesaleApplyOpen(true);
      toast({
        title: "Wholesale access required",
        description: "Apply to become an authorized partner to access counterparties and trading.",
        variant: "destructive",
      });
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        price: getCartUnitPrice(product),
        quantity: 1,
        shopId: shop?.id || product.shopId,
        shopName: shop?.shopName || product.shopName,
        categorySlug: getMarketplaceCategory(product),
      }];
    });
    toast({
      title: "Added to cart",
      description: `${product.name} added`
    });
  };

  const updateCartQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const orderMutation = useMutation({
    mutationFn: async (orderData: { sellerId: number; items: { productId: number; quantity: number }[]; pickupPartnerId?: string | null }) => {
      const buyerEmail = session.user?.email
        ? String(session.user.email).toLowerCase()
        : `guest:${session.guestSessionId}`;
      const buyerName = session.user?.displayName || (isDemoModeEnabled() ? "Demo Buyer" : "Guest Buyer");
      return await apiRequest("/api/marketplace/buyer/orders", {
        method: "POST",
        body: JSON.stringify({
          sellerId: orderData.sellerId,
          items: orderData.items,
          buyerEmail,
          buyerName,
          deliveryAddress: "To be confirmed",
          deliveryLat: userPosition[0],
          deliveryLng: userPosition[1],
          pickupPartnerId: orderData.pickupPartnerId || undefined,
        })
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Order placed!",
        description: `Order ${data.order.orderNumber} created successfully`
      });
      setCart([]);
      setCartOpen(false);
      navigate(`/orders/${encodeURIComponent(String(data?.order?.orderNumber))}?pay=1`);
    },
    onError: (error: any) => {
      toast({
        title: "Order failed",
        description: error.message || "Failed to place order",
        variant: "destructive"
      });
    }
  });

  const transferMutation = useMutation({
    mutationFn: async (data: { recipientEmail: string; amount: string; note: string }) => {
      return await apiRequest("/api/marketplace/buyer/wallet/transfer", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Transfer successful!",
        description: data.message
      });
      setTransferOpen(false);
      setTransferRecipient("");
      setTransferAmount("");
      setTransferNote("");
      setTransferSearchResults([]);
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/wallet"] });
    },
    onError: (error: any) => {
      toast({
        title: "Transfer failed",
        description: error.message || "Failed to send credits",
        variant: "destructive"
      });
    }
  });

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
    setTransferSearchResults([]);
      return;
    }
    setTransferSearching(true);
    try {
      const res = await fetch(
        resolveApiUrl(
          `/api/marketplace/buyer/wallet/search-users?q=${encodeURIComponent(query)}`,
        ),
      );
      const data = await res.json();
      setTransferSearchResults(data.users || []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setTransferSearching(false);
    }
  };

  const handleTransfer = () => {
    if (!transferRecipient || !transferAmount) {
      toast({
        title: "Missing info",
        description: "Please enter recipient and amount",
        variant: "destructive"
      });
      return;
    }
    transferMutation.mutate({
      recipientEmail: transferRecipient,
      amount: transferAmount,
      note: transferNote
    });
  };

  const handlePlaceOrder = () => {
    if (cart.length === 0) return;
    
    const shopGroups = cart.reduce((acc, item) => {
      if (!acc[item.shopId]) acc[item.shopId] = [];
      acc[item.shopId].push({ productId: item.productId, quantity: item.quantity });
      return acc;
    }, {} as Record<number, { productId: number; quantity: number }[]>);
    
    const shopIds = Object.keys(shopGroups);
    if (shopIds.length > 1) {
      toast({
        title: "Multiple shops",
        description: "Please order from one shop at a time. Remove items from other shops.",
        variant: "destructive"
      });
      return;
    }
    
    const sellerId = parseInt(shopIds[0]);
    orderMutation.mutate({ sellerId, items: shopGroups[sellerId] });
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  const getCategory = isGoldTenant ? getGoldCategory : getMarketplaceCategory;
  const getSecondaryTags = (product: any) => {
    const primary = getCategory(product);
    const normalizedPrimary = normalizeForMatch(primary);

    const raw = product?.tags;
    let tags: string[] = [];
    if (Array.isArray(raw)) {
      tags = raw.map((t) => String(t));
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) tags = parsed.map((t) => String(t));
          else tags = trimmed.split(/[,]+/g).map((t) => t.trim());
        } catch {
          tags = trimmed.split(/[,]+/g).map((t) => t.trim());
        }
      }
    }

    const blocked = new Set(
      [
        normalizedPrimary,
        "dore",
        "stamped",
        "jewelry",
        "gold-art",
      ].filter(Boolean),
    );

    const seen = new Set<string>();
    const result: string[] = [];
    for (const tag of tags) {
      const cleaned = String(tag || "").trim();
      if (!cleaned) continue;
      const key = normalizeForMatch(cleaned);
      if (!key) continue;
      if (key.length <= 1) continue;
      if (/^[a-z]{2}$/.test(key)) continue;
      if (blocked.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
      if (result.length >= 6) break;
    }
    return result;
  };
  const availableCategorySlugs = isGoldTenant
    ? MODE_CATEGORIES[buyerMode]
    : ((marketplaceCategories as Array<any>)
        .map((cat) => String(cat?.slug || "").trim())
        .filter(Boolean) as string[]);
  const allowedCategories = availableCategorySlugs.length ? availableCategorySlugs : Object.keys(categoryMetaMap);
  const allowedCategorySet = new Set<string>(allowedCategories);

  const isAllowedProduct = (p: any) => {
    if (!isGoldTenant) return true;
    const category = getGoldCategory(p);
    return category !== null && allowedCategorySet.has(category);
  };
  const isAllowedShop = (shop: any) => {
    if (buyerMode === "retail" && MODE_CATEGORIES.retail.includes("jewelry")) {
      const isJeweler =
        shop?.sellerType === "jeweler" || shop?.productionType === "jewelry_manufacturing";
      if (isJeweler) return true;
    }
    return shop.products?.some(isAllowedProduct);
  };

  const previewCategorySlug = isGoldTenant ? "dore" : "wholesale";
  const previewCategoryName = isGoldTenant ? "Dore (Raw Gold)" : t("mode.wholesale");
  const previewProductName = isGoldTenant ? "Dore Lot (Preview)" : "Wholesale Lot (Preview)";
  const previewShopName = `${retailModeLabel} Wholesale Preview`;

  const previewShops = [
    {
      id: -101,
      shopName: previewShopName,
      slug: "preview-ci",
      latitude: "7.55",
      longitude: "-5.55",
      streetAddress: "Côte d'Ivoire (Regional)",
      status: "approved",
      products: [
        {
          id: -1001,
          name: previewProductName,
          price: "0",
          currency: "XOF",
          stockQuantity: 1,
          categorySlug: previewCategorySlug,
          categoryName: previewCategoryName,
        },
      ],
      distance: null,
      distanceText: null,
    },
    {
      id: -102,
      shopName: previewShopName,
      slug: "preview-gh",
      latitude: "7.55",
      longitude: "-1.55",
      streetAddress: "Ghana (Regional)",
      status: "approved",
      products: [
        {
          id: -1002,
          name: previewProductName,
          price: "0",
          currency: "XOF",
          stockQuantity: 1,
          categorySlug: previewCategorySlug,
          categoryName: previewCategoryName,
        },
      ],
      distance: null,
      distanceText: null,
    },
    {
      id: -103,
      shopName: previewShopName,
      slug: "preview-ml",
      latitude: "14.55",
      longitude: "-4.55",
      streetAddress: "Mali (Regional)",
      status: "approved",
      products: [
        {
          id: -1003,
          name: previewProductName,
          price: "0",
          currency: "XOF",
          stockQuantity: 1,
          categorySlug: previewCategorySlug,
          categoryName: previewCategoryName,
        },
      ],
      distance: null,
      distanceText: null,
    },
  ];

	  const nearbyShops = Array.isArray(nearbyData?.shops) ? nearbyData.shops : [];
	  const allShops = isWholesalePreview ? previewShops : nearbyShops;
	  const shops = allShops.filter(isAllowedShop).map((shop: any) => ({
	    ...shop,
	    products: shop.products?.filter(isAllowedProduct) || []
	  }));
	  const productsLoading = (nearbyLoading || nearbyFetching) && !isWholesalePreview;
	  const nearbyFallbackUsed = Boolean((nearbyData as any)?.fallback?.used);

  useEffect(() => {
    if (!productsLoading) {
      setSlowNearbyLoading(false);
      return;
    }
    const timerId = window.setTimeout(() => setSlowNearbyLoading(true), 6500);
    return () => window.clearTimeout(timerId);
  }, [productsLoading, userPosition[0], userPosition[1], selectedCategory, radiusKm]);

  const categories = allowedCategories.map((slug) => {
    const meta = getCategoryMeta(slug);
    return {
      id: slug,
      slug,
      name: meta.label,
      icon: meta.icon,
      color: meta.accent,
    };
  });

	  const getCategoryChipLabel = (label: string) => {
	    const cleaned = String(label || "").replace(/\s+/g, " ").trim();
	    const parts = cleaned.split("/").map((p) => p.trim()).filter(Boolean);
	    if (parts.length < 2) return cleaned;
	    const isFrench = String(language || "").toLowerCase().startsWith("fr");
	    return isFrench ? parts[1] : parts[0];
	  };
	
	  const updateCategoryChipsUiState = useCallback(() => {
	    if (typeof window === "undefined") return;
	    const el = categoryChipsRef.current;
	    if (!el) return;
	
	    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
	    const overflow = maxScroll > 4;
	    const atStart = !overflow || el.scrollLeft <= 1;
	    const atEnd = !overflow || el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
	
	    setCategoryChipsUi((prev) => {
	      if (prev.atStart === atStart && prev.atEnd === atEnd && prev.overflow === overflow) return prev;
	      return { atStart, atEnd, overflow };
	    });
	  }, []);
	
	  const scrollCategoryChipsBy = useCallback(
	    (direction: 1 | -1) => {
	      if (typeof window === "undefined") return;
	      const el = categoryChipsRef.current;
	      if (!el) return;
	
	      const first = el.querySelector<HTMLElement>("button") ?? (el.firstElementChild as HTMLElement | null);
	      const chipWidth = first ? first.getBoundingClientRect().width : 140;
	      const styles = window.getComputedStyle(el);
	      const gapRaw = parseFloat(styles.columnGap || styles.gap || "8");
	      const gap = Number.isFinite(gapRaw) ? gapRaw : 8;
	      const delta = (chipWidth + gap) * 3;
	
	      el.scrollTo({ left: el.scrollLeft + direction * delta, behavior: "smooth" });
	    },
	    [],
	  );
	
	  useEffect(() => {
	    const el = categoryChipsRef.current;
	    if (!el) return;
	
	    updateCategoryChipsUiState();
	
	    const onScroll = () => updateCategoryChipsUiState();
	    el.addEventListener("scroll", onScroll, { passive: true });
	    window.addEventListener("resize", onScroll);
	
	    return () => {
	      el.removeEventListener("scroll", onScroll);
	      window.removeEventListener("resize", onScroll);
	    };
	  }, [categories.length, updateCategoryChipsUiState]);
	
	  useEffect(() => {
	    if (typeof window === "undefined") return;
	    if (!selectedCategory) {
	      updateCategoryChipsUiState();
	      return;
	    }
	
	    const el = categoryChipsRef.current;
	    if (!el) return;
	
	    const target = el.querySelector<HTMLElement>(`[data-category-slug="${CSS.escape(selectedCategory)}"]`);
	    if (!target) return;
	
	    try {
	      target.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
	    } catch {
	      // ignore
	    }
	  }, [selectedCategory, updateCategoryChipsUiState]);

  const previewSections = [
    {
      id: "wholesale-preview",
      title: t("wholesale.preview.title"),
      subtitle: t("wholesale.preview.subtitle"),
      products: [
        {
          id: -2001,
          name: previewProductName,
          description: t("wholesale.preview.subtitle"),
          price: "0",
          currency: "XOF",
          shopName: "Authorized Counterparty (Hidden)",
          shopId: -101,
          categorySlug: previewCategorySlug,
          categoryName: previewCategoryName,
          stockQuantity: 0,
          inStock: false,
        },
      ],
    },
  ];

  const feedSectionI18n: Record<string, { titleKey: string; subtitleKey: string }> = {
    "around-you": { titleKey: "feed.aroundYou.title", subtitleKey: "feed.aroundYou.subtitle" },
    popular: { titleKey: "feed.popular.title", subtitleKey: "feed.popular.subtitle" },
  };

  const feedSections = Array.isArray(feedData?.sections) ? feedData.sections : [];
  const allSections = isWholesalePreview ? previewSections : feedSections;
  const sections = allSections
    .map((section: any) => {
      const id = typeof section?.id === "string" ? section.id : null;
      const labelKeys = id ? feedSectionI18n[id] : undefined;
      const title = labelKeys ? t(labelKeys.titleKey) : section.title;
      const subtitle = labelKeys ? t(labelKeys.subtitleKey) : section.subtitle;

      return {
        ...section,
        title,
        subtitle,
        products: section.products?.filter(isAllowedProduct) || [],
      };
    })
    .filter((section: any) => section.products?.length > 0);

  const [showProducts, setShowProducts] = useState(() => !isWholesalePreview);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedProductImageIndex, setSelectedProductImageIndex] = useState(0);
  const [panelExpanded, setPanelExpanded] = useState<Record<string, boolean>>({
    dore: false,
    stamped: false,
    jewelry: false,
    "gold-art": false,
  });

  const setRetailMode = () => {
    setBuyerMode("retail");
    setMarketMode("marketplace");
    setShowProducts(true);
    if (session.isAuthenticated) session.setBuyerType?.("retail" as any);
  };

  const setWholesaleMode = (target: "dore" | "machinery" = "dore") => {
    setBuyerMode("wholesale");
    setShowProducts(true);
    if (!isGoldTenant) {
      setMarketMode("dore");
      if (session.isAuthenticated) session.setBuyerType?.("wholesale" as any);
      return;
    }
    if (isWholesaleAuthorized) {
      setMarketMode(target);
      session.setBuyerType?.("wholesale" as any);
    } else {
      setMarketMode("dore");
      setWholesaleApplyOpen(true);
    }
  };

  const setInvestMode = () => {
    setShowProducts(true);
    setBuyerMode("wholesale");
    if (isWholesaleAuthorized) {
      setMarketMode("investments");
      session.setBuyerType?.("wholesale" as any);
    } else {
      setMarketMode("dore");
      setWholesaleApplyOpen(true);
    }
  };

  useEffect(() => {
    if (!location || location === lastQueryHandledRef.current) return;
    lastQueryHandledRef.current = location;
    const queryString = location.split("?")[1];
    if (!queryString) return;
    const params = new URLSearchParams(queryString);
    const mode = params.get("mode");
    if (mode === "retail") setRetailMode();
    if (mode === "wholesale") setWholesaleMode("dore");
    if (mode === "invest") setInvestMode();
	    const market = params.get("market");
	    if (market === "machinery") setWholesaleMode("machinery");
	    const panel = params.get("panel");
	    const topup = params.get("topup");
	    if (topup === "1" || topup === "true") {
	      setVaultPane("wallet");
	      setVaultOpen(true);
	      setCartOpen(false);
	      setWalletTopupAutoOpen(true);
	    }
	    if (panel === "wallet") {
	      setVaultPane("wallet");
	      setVaultOpen(true);
	      setCartOpen(false);
	    }
    if (panel === "vault") {
      setVaultPane("vault");
      setVaultOpen(true);
      setCartOpen(false);
    }
    if (panel === "cart") {
      setCartOpen(true);
      setVaultOpen(false);
    }
    if (mapEnabled && panel === "map") {
      setMapOverlayOpen(true);
    }
    if (mapEnabled && panel === "browse") {
      setMapOverlayOpen(false);
    }
  }, [location, isWholesaleAuthorized, mapEnabled]);

  useEffect(() => {
    setPanelExpanded((prev) => ({
      ...prev,
      jewelry: false,
    }));
  }, [buyerMode]);

  useEffect(() => {
    if (!isWholesalePreview) return;
    setShowProducts(false);
    setSelectedProduct(null);
    setSelectedShop(null);
    setConciergeOpen(false);
    setCartOpen(false);
  }, [isWholesalePreview]);

  useEffect(() => {
    setSelectedProduct(null);
    setSelectedShop(null);
    setSelectedMachinery(null);
    setSelectedOpportunity(null);
    if (marketMode !== "dore") {
      setSelectedCategory(null);
      setSearchQuery("");
    }
  }, [marketMode]);

  const placeholderPalette = [
    { bg: "#0f172a", accent: "#f59e0b" },
    { bg: "#111827", accent: "#10b981" },
    { bg: "#0b1320", accent: "#eab308" },
    { bg: "#111114", accent: "#f97316" },
    { bg: "#0b0f14", accent: "#22d3ee" },
  ];

  const buildProductPlaceholder = (product: any, variantIndex: number) => {
    const category = getCategory(product);
    const meta = getCategoryMeta(category);
    const seed = Number(product?.id || 0) + variantIndex * 17;
    const palette = placeholderPalette[Math.abs(seed) % placeholderPalette.length];
    const label = String(product?.name || meta.label || brand.name).slice(0, 18);
    const subtitle = category ? meta.label : brand.name;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${palette.bg}"/>
            <stop offset="100%" stop-color="#000000"/>
          </linearGradient>
        </defs>
        <rect width="1080" height="1350" fill="url(#g)"/>
        <circle cx="870" cy="240" r="180" fill="${palette.accent}" opacity="0.2"/>
        <circle cx="240" cy="1100" r="220" fill="${palette.accent}" opacity="0.16"/>
        <rect x="120" y="180" width="840" height="980" rx="64" fill="none" stroke="${palette.accent}" stroke-width="4" opacity="0.35"/>
        <text x="160" y="300" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="36" letter-spacing="4">${subtitle}</text>
        <text x="160" y="380" fill="#ffffff" font-family="Arial, sans-serif" font-size="48" font-weight="600">${label}</text>
        <text x="160" y="430" fill="#ffffff" opacity="0.6" font-family="Arial, sans-serif" font-size="26">${tenantIdentity.platformLabel}</text>
      </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const collectProductImages = (product: any): string[] => {
    const images: string[] = [];
    const directImage = product?.image;
    if (typeof directImage === "string" && directImage) images.push(absolutizePublicUrl(directImage));

    const rawImages = product?.images;
    if (Array.isArray(rawImages)) {
      rawImages.forEach((img) => {
        if (typeof img === "string" && img) images.push(absolutizePublicUrl(img));
      });
    } else if (typeof rawImages === "string" && rawImages) {
      try {
        const parsed = JSON.parse(rawImages);
        if (Array.isArray(parsed)) {
          parsed.forEach((img) => {
            if (typeof img === "string" && img) images.push(absolutizePublicUrl(img));
          });
        } else if (typeof parsed === "string" && parsed) {
          images.push(absolutizePublicUrl(parsed));
        }
      } catch {
        images.push(absolutizePublicUrl(rawImages));
      }
    }

    const rawAttrs = product?.attributes;
    const attrs =
      rawAttrs && typeof rawAttrs === "object"
        ? rawAttrs
        : typeof rawAttrs === "string"
          ? (() => {
              try {
                return JSON.parse(rawAttrs);
              } catch {
                return null;
              }
            })()
          : null;
    if (attrs && typeof attrs === "object") {
      const gallery = (attrs as any)?.images || (attrs as any)?.gallery || (attrs as any)?.photos;
      if (Array.isArray(gallery)) {
        gallery.forEach((img) => {
          if (typeof img === "string" && img) images.push(absolutizePublicUrl(img));
        });
      }
    }

    const unique = Array.from(new Set(images));
    return unique;
  };

  const getProductImages = (product: any) => {
    const images = collectProductImages(product);
    if (images.length) return images;

    const category = getCategory(product);
    const meta = getCategoryMeta(category);
    if (meta?.image) return [meta.image];

    return [buildProductPlaceholder(product, 0)];
  };

  const getCommodityImage = (product: any) => getProductImages(product)[0];

  const getProductVideoUrl = (product: any): string | null => {
    const direct = product?.videoUrl;
    if (typeof direct === "string" && direct) return direct;

    const rawAttrs = product?.attributes;
    const attrs =
      rawAttrs && typeof rawAttrs === "object"
        ? rawAttrs
        : typeof rawAttrs === "string"
          ? (() => {
              try {
                return JSON.parse(rawAttrs);
              } catch {
                return null;
              }
            })()
          : null;

    if (attrs && typeof attrs === "object") {
      const url = (attrs as any)?.videoUrl;
      if (typeof url === "string" && url) return url;
      const videos = (attrs as any)?.videos;
      if (Array.isArray(videos) && typeof videos[0] === "string" && videos[0]) return videos[0];
    }

    return null;
  };

  const getMixedGoldProducts = (products: any[]) => {
    const doreProducts = products.filter((p: any) => 
      p.name?.toLowerCase().includes('doré') || p.name?.toLowerCase().includes('dore')
    );
    const refinedProducts = products.filter((p: any) => 
      !(p.name?.toLowerCase().includes('doré') || p.name?.toLowerCase().includes('dore'))
    );
    
    const mixed: any[] = [];
    const maxLen = Math.max(doreProducts.length, refinedProducts.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < doreProducts.length) mixed.push(doreProducts[i]);
      if (i < refinedProducts.length) mixed.push(refinedProducts[i]);
    }
    return mixed;
  };

  const getMixedModeProducts = (products: any[]) => {
    if (!isGoldTenant) return products;
    const byCategory: Record<string, any[]> = { dore: [], stamped: [], jewelry: [], "gold-art": [] };
    for (const p of products) {
      const category = getGoldCategory(p);
      if (category && allowedCategorySet.has(category)) byCategory[category].push(p);
    }

    const orderedLists = allowedCategories.map((slug) => byCategory[slug] || []);
    const maxLen = Math.max(0, ...orderedLists.map((l) => l.length));

    const mixed: any[] = [];
    for (let i = 0; i < maxLen; i++) {
      for (const list of orderedLists) {
        if (list[i]) mixed.push(list[i]);
      }
    }
    return mixed;
  };

  const getProductsByCategory = (products: any[]) => {
    if (!isGoldTenant) {
      const byCategory: Record<string, any[]> = {};
      for (const p of products) {
        const category = getCategory(p) || "default";
        if (!byCategory[category]) byCategory[category] = [];
        byCategory[category].push(p);
      }
      return byCategory;
    }

    const byCategory: Record<string, any[]> = { dore: [], stamped: [], jewelry: [], "gold-art": [] };
    for (const p of products) {
      const category = getGoldCategory(p);
      if (category && allowedCategorySet.has(category)) byCategory[category].push(p);
    }
    return byCategory;
  };

  const getCategoryBadge = (product: any) => {
    if (!isGoldTenant) {
      const category = getCategory(product);
      const meta = getCategoryMeta(category);
      return { label: meta.label.toUpperCase(), className: "bg-white/10 text-white border-white/30" };
    }
    const category = getGoldCategory(product);
    if (category === "dore") {
      return { label: t("product.dore").toUpperCase(), className: "bg-orange-500/80 text-white border-orange-400/50" };
    }
    if (category === "stamped") {
      return { label: "STAMPED", className: "bg-emerald-500/80 text-white border-emerald-400/50" };
    }
    if (category === "gold-art") {
      return { label: "GOLD ART", className: "bg-yellow-500/70 text-black border-yellow-300/60" };
    }
    if (category === "jewelry") {
      return { label: "JEWELRY", className: "bg-violet-500/70 text-white border-violet-300/60" };
    }
    return { label: "GOLD", className: "bg-white/20 text-white border-white/30" };
  };
  
  const getGoldTypeLabel = (product: any) => {
    const nameLower = product?.name?.toLowerCase() || '';
    if (nameLower.includes("doré") || nameLower.includes("dore")) {
      return { label: t("product.dore").toUpperCase(), color: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
    }
    if (nameLower.includes("18k") || nameLower.includes("18 karat") || nameLower.includes("750")) {
      return { label: t("product.18k"), color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" };
    }
    if (nameLower.includes("22k") || nameLower.includes("22 karat") || nameLower.includes("916.7")) {
      return { label: t("product.22k"), color: "bg-teal-500/20 text-teal-400 border-teal-500/30" };
    }
    return { label: "STAMPED", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
  };

  const getShopPrimaryCategory = (shop: any): string => {
    const categories = new Set(
      (shop?.products || [])
        .map(getCategory)
        .filter(Boolean) as string[]
    );

    if (isGoldTenant) {
      const isJeweler =
        shop?.sellerType === "jeweler" || shop?.productionType === "jewelry_manufacturing";
      if (isJeweler) {
        if (categories.has("jewelry")) return "jewelry";
        if (categories.has("gold-art")) return "gold-art";
        return "jewelry";
      }
      if (categories.has("dore")) return "dore";
      if (categories.has("stamped")) return "stamped";
      if (categories.has("jewelry")) return "jewelry";
      if (categories.has("gold-art")) return "gold-art";
      return buyerMode === "wholesale" ? "dore" : "stamped";
    }

    return categories.values().next().value || "default";
  };

  const getShopTypeLabel = (shop: any) => {
    if (!isGoldTenant) return "Seller";
    const category = getShopPrimaryCategory(shop);
    if (category === "dore") return t("product.sellerType.wholesaleSupplier");
    if (category === "jewelry" || category === "gold-art") return t("product.sellerType.jewelryManufacturer");
    return t("product.sellerType.retailSeller");
  };

  const getShopStockLabel = (shop: any) => {
    const category = getShopPrimaryCategory(shop);
    const totalStock = (shop?.products || []).reduce((sum: number, p: any) => sum + (p.stockQuantity || 0), 0);
    if (!isGoldTenant) return `${totalStock} items available`;

    if (shop?.productionType === "gold_mining" || category === "dore") {
      const mineType = normalizeMineType(shop?.mineType);
      const estKg =
        parseMaybeNumber(shop?.estWeeklyOutputKg) ??
        parseMaybeNumber(shop?.avgWeeklyOutputKg) ??
        parseMaybeNumber(shop?.availableThisWeekKg) ??
        null;

      const rangeMinRaw =
        parseMaybeNumber(shop?.estWeeklyOutputRangeMinKg) ??
        (estKg != null ? estKg * 0.6 : mineType === "industrial" ? 2.0 : 1.0);
      const rangeMaxRaw =
        parseMaybeNumber(shop?.estWeeklyOutputRangeMaxKg) ??
        (estKg != null ? estKg * 1.2 : mineType === "industrial" ? 5.0 : 2.0);

      const rangeMinKg = Math.min(rangeMinRaw, rangeMaxRaw);
      const rangeMaxKg = Math.max(rangeMinRaw, rangeMaxRaw);

      const doreStockRaw =
        (shop?.products || []).reduce(
          (sum: number, p: any) => sum + (getGoldCategory(p) === "dore" ? (p.stockQuantity || 0) : 0),
          0,
        ) || 0;
      const sumAvailableKg = doreStockRaw > 0 ? doreStockRaw / 1000 : 0;

      if (sumAvailableKg > 0) {
        const displayKg = Math.min(sumAvailableKg, rangeMaxKg * 1.5);
        const safetyCap = mineType === "industrial" ? Number.POSITIVE_INFINITY : 5;
        return `Available this week: ${formatKgAsHuman(Math.min(displayKg, safetyCap))}`;
      }

      return `~${formatKgRangeAsHuman(rangeMinKg, rangeMaxKg)}/wk`;
    }

    return `${totalStock} pcs available`;
  };

  const getProductStockLabel = (product: any) => {
    if (isWholesalePreview) return { text: "PREVIEW", inStock: false };
    if (!isGoldTenant) {
      const qty = toNumber(product?.stockQuantity);
      if (!qty) return { text: "OUT", inStock: false };
      return { text: `${qty} in stock`, inStock: true };
    }
    const category = getGoldCategory(product);
    const qty = toNumber(product?.stockQuantity);
    if (!category || qty <= 0) return { text: 'SOLD', inStock: false };
    if (category === 'dore') return { text: `${(qty / 1000).toFixed(1)}kg AVAIL`, inStock: true };

    const weightG = getProductWeightGrams(product);
    const totalKg = weightG ? (qty * weightG) / 1000 : 0;
    const totalKgText = totalKg ? ` (~${totalKg.toFixed(1)}kg)` : '';
    return { text: `${qty} pcs${totalKgText} AVAIL`, inStock: true };
  };

  const getProductPriceDisplay = (product: any) => {
    const price = toNumber(product?.price);
    const fromCurrency = normalizeCurrencyCode(product?.currency);
    if (!isGoldTenant) {
      return { primary: formatAmount(price, fromCurrency) };
    }
    const category = getGoldCategory(product);
    if (category === 'dore') {
      return { primary: formatAmount(price, fromCurrency, '/g') };
    }
    if (category === 'stamped') {
      const weightG = getProductWeightGrams(product);
      const piecePrice = weightG ? price * weightG : price;
      return { primary: formatAmount(piecePrice, fromCurrency), secondary: formatAmount(price, fromCurrency, '/g') };
    }
    return { primary: formatAmount(price, fromCurrency) };
  };

  const getCartUnitPrice = (product: any) => {
    const price = toNumber(product?.price);
    if (!isGoldTenant) return price;
    const category = getGoldCategory(product);
    if (category === 'stamped') {
      const weightG = getProductWeightGrams(product);
      return weightG ? price * weightG : price;
    }
    return price;
  };

  const matchesSearch = (product: any, query: string) => {
    const normalized = normalizeForMatch(query);
    if (!normalized) return true;
    const terms = normalized.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;

    const haystack = [
      product?.name,
      product?.description,
      product?.categoryName,
      product?.shopName,
    ]
      .map((value) => normalizeForMatch(value))
      .join(" ");

    return terms.every((term) => haystack.includes(term));
  };

  const parseFiniteNumber = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const getProductDistanceKm = (product: any): number | null => {
    const km =
      parseFiniteNumber(product?.distance) ??
      parseFiniteNumber(product?.distanceKm) ??
      parseFiniteNumber(product?.distance_km);
    if (km != null) return km;

    const meters =
      parseFiniteNumber(product?.distanceMeters) ??
      parseFiniteNumber(product?.distance_m);
    if (meters != null) return meters / 1000;

    return null;
  };

  const getProductDistanceValue = (product: any) => {
    const km = getProductDistanceKm(product);
    return km ?? Number.POSITIVE_INFINITY;
  };

  const formatDistanceAway = (distanceKm: number | null) => {
    if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
    const km = Math.max(0, distanceKm);
    if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m away`;
    if (km < 10) return `${km.toFixed(1)} km away`;
    return `${Math.round(km)} km away`;
  };

  const getAvailabilityScore = (product: any) => (getProductStockLabel(product).inStock ? 0 : 1);

  const getProductSoldValue = (product: any) => {
    const sold =
      toNumber(product?.totalSold) ??
      toNumber(product?.total_sold) ??
      toNumber(product?.sold) ??
      0;
    return Number.isFinite(sold) ? sold : 0;
  };

  const getCategoryScore = (product: any) => {
    const category = getCategory(product);
    if (!category) return 99;
    const idx = allowedCategories.indexOf(category);
    return idx === -1 ? 99 : idx;
  };

  const sortByProximity = (a: any, b: any) => {
    const distanceDiff = getProductDistanceValue(a) - getProductDistanceValue(b);
    if (distanceDiff !== 0) return distanceDiff;
    if (buyerMode === "retail") {
      const soldDiff = getProductSoldValue(b) - getProductSoldValue(a);
      if (soldDiff !== 0) return soldDiff;
      const priceDiff = getCartUnitPrice(a) - getCartUnitPrice(b);
      if (priceDiff !== 0) return priceDiff;
    }
    const availabilityDiff = getAvailabilityScore(a) - getAvailabilityScore(b);
    if (availabilityDiff !== 0) return availabilityDiff;
    const categoryDiff = getCategoryScore(a) - getCategoryScore(b);
    if (categoryDiff !== 0) return categoryDiff;
    return (toNumber(a?.id) || 0) - (toNumber(b?.id) || 0);
  };

  const sortProducts = (items: any[]) => {
    const sorted = [...items];
    if (feedSort === "default" || feedSort === "distance") {
      sorted.sort(sortByProximity);
      return sorted;
    }
    const direction = feedSort === "price_desc" ? -1 : 1;
    sorted.sort((a, b) => {
      const priceDiff = (getCartUnitPrice(a) - getCartUnitPrice(b)) * direction;
      if (priceDiff !== 0) return priceDiff;
      return sortByProximity(a, b);
    });
    return sorted;
  };

  const panelSourceProducts = sections.flatMap((section: any) => section.products || []);
  const filteredPanelSourceProducts = panelSourceProducts.filter((product: any) => {
    if (selectedCategory) {
      const category = getCategory(product);
      if (category !== selectedCategory) return false;
    }
    return matchesSearch(product, searchQuery);
  });
  const sortedPanelSourceProducts = sortProducts(filteredPanelSourceProducts);
  const reelsItems = isGoldTenant
    ? sortedPanelSourceProducts.filter((product: any) => {
        const category = getGoldCategory(product);
        if (!category) return false;
        if (buyerMode === "wholesale") return category === "dore";
        return category === "stamped" || category === "jewelry" || category === "gold-art";
      })
    : sortedPanelSourceProducts;

  useEffect(() => {
    if (!isFeedMode || radiusCustomized) return;
    if (reelsItems.length > 0) return;
    if (radiusKm >= 500) return;
    setRadiusKm(500);
  }, [isFeedMode, radiusCustomized, reelsItems.length, radiusKm]);

  const toggleMapOverlay = () => {
    if (!mapEnabled) return;
    if (!mapOverlayOpen && isFeedMode && reelsItems.length === 0) {
      toast({
        title: "Map loading",
        description: "The map will appear once products load.",
      });
    }
    setMapOverlayOpen((prev) => !prev);
  };
  const panelByCategory = getProductsByCategory(sortedPanelSourceProducts);
  const shopRailSourceProducts = shops.flatMap((shop: any) =>
    (shop.products || []).map((product: any) => ({
      ...product,
      shopName: product?.shopName || shop.shopName,
      shopId: product?.shopId || shop.id,
      shopSlug: product?.shopSlug || shop.slug,
      distance: getProductDistanceKm(product) ?? shop.distance ?? null,
      distanceText: product?.distanceText || shop.distanceText || null,
    })),
  );
  const filteredShopRailProducts = shopRailSourceProducts.filter((product: any) => {
    if (selectedCategory) {
      const category = getCategory(product);
      if (category !== selectedCategory) return false;
    }
    return matchesSearch(product, searchQuery);
  });
  const sortedShopRailProducts = sortProducts(filteredShopRailProducts);
  const shopRailByCategory = getProductsByCategory(sortedShopRailProducts);

  const retailRailByCategory = sortedShopRailProducts.length > 0 ? shopRailByCategory : panelByCategory;
  const panelAllProducts = panelSourceProducts.filter((product: any) => matchesSearch(product, searchQuery));
  const sortedPanelAllProducts = sortProducts(panelAllProducts);
  const panelAllByCategory = getProductsByCategory(sortedPanelAllProducts);
  const hasFilteredProducts = sortedShopRailProducts.length > 0 || sortedPanelSourceProducts.length > 0;
  const showFallbackProducts = !hasFilteredProducts && Boolean(selectedCategory) && sortedPanelAllProducts.length > 0;
  const retailDisplayByCategory = showFallbackProducts ? panelAllByCategory : retailRailByCategory;
  const effectiveCategoryFilter = showFallbackProducts ? null : selectedCategory;

  const goldArtNeedsFallback =
    buyerMode === "retail" &&
    isGoldTenant &&
    (retailDisplayByCategory["gold-art"] || []).length === 0;

  // Gold Art is rare and often missing at tight radiuses (e.g., a few km).
  // When the rail is empty, automatically widen the search for this rail so
  // admins/users can still discover available items.
  const goldArtFallbackRadiusKm = useMemo(() => Math.max(radiusKm, 2000), [radiusKm]);

  const goldArtFallbackQuery = useQuery({
    queryKey: [
      "/api/marketplace/buyer/nearby",
      userPosition[0],
      userPosition[1],
      "gold-art:fallback",
      goldArtFallbackRadiusKm,
      productsPerSeller,
    ],
    queryFn: async ({ signal }) => {
      // When the Gold Art rail is empty, fetch the Gold Art category explicitly. The server-side
      // matcher also includes heuristic cues (tags/name/description) to recover mis-categorized items.
      const params = new URLSearchParams({
        lat: userPosition[0].toString(),
        lng: userPosition[1].toString(),
        radius: goldArtFallbackRadiusKm.toString(),
        category: "gold-art",
      });
      if (productsPerSeller > 0) {
        params.set("productsPerSeller", String(productsPerSeller));
      }
      const res = await fetch(resolveApiUrl(`/api/marketplace/buyer/nearby?${params}`), {
        signal,
        cache: "no-store",
        headers: { ...getDemoModeHeaders(), "x-ece-lang": language },
      });
      if (!res.ok) return { shops: [] };
      return res.json();
    },
    enabled: goldArtNeedsFallback,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const goldArtFallbackData = goldArtFallbackQuery.data;

  const goldArtFallbackItems = useMemo(() => {
    if (!goldArtNeedsFallback) return [];
    const shops = Array.isArray((goldArtFallbackData as any)?.shops) ? (goldArtFallbackData as any).shops : [];
    const flat = shops.flatMap((shop: any) =>
      (shop?.products || []).map((product: any) => ({
        ...product,
        shopName: product?.shopName || shop.shopName,
        shopId: product?.shopId || shop.id,
        shopSlug: product?.shopSlug || shop.slug,
        distance: getProductDistanceKm(product) ?? shop.distance ?? null,
        distanceText: product?.distanceText || shop.distanceText || null,
      })),
    );
    const q = String(searchQuery || "").trim();
    const filtered = q ? flat.filter((product: any) => matchesSearch(product, q)) : flat;
    const byCategory = getProductsByCategory(filtered);
    return (byCategory["gold-art"] || []).slice(0, 24);
  }, [goldArtFallbackData, goldArtNeedsFallback, matchesSearch, searchQuery]);

  const retailDisplayByCategoryResolved =
    goldArtNeedsFallback && goldArtFallbackItems.length > 0
      ? { ...retailDisplayByCategory, "gold-art": goldArtFallbackItems }
      : retailDisplayByCategory;

  const RETAIL_DISTANCE_BANDS_KM = [2, 5, 10, 50, 150, 300, 500, 1000, 20000] as const;
  const getNextRetailRadiusKm = (currentKm: number) => {
    if (!useProximityRadius) return null;
    const next = RETAIL_DISTANCE_BANDS_KM.find((band) => band > currentKm + 1e-6);
    return next ?? null;
  };

  const updateVisibleRailShops = (slug: string) => {
    if (typeof window === "undefined") return;
    const rail = railRefs.current[slug];
    if (!rail) return;

    const containerRect = rail.getBoundingClientRect();
    const inView = new Set<number>();
    rail.querySelectorAll<HTMLElement>("[data-shop-id]").forEach((el) => {
      const rect = el.getBoundingClientRect();
      const visible = rect.right > containerRect.left + 8 && rect.left < containerRect.right - 8;
      if (!visible) return;
      const idRaw = el.dataset.shopId;
      const id = idRaw ? Number(idRaw) : NaN;
      if (Number.isFinite(id)) inView.add(id);
    });

    setVisibleRailShopIds((prev) => {
      const next = Array.from(inView.values());
      if (prev.length === next.length && prev.every((v, idx) => v === next[idx])) return prev;
      return next;
    });
  };

  const scrollToShopInRails = (shopId: number, preferredSlug?: string | null) => {
    const candidates = preferredSlug ? [preferredSlug, ...panelSections.map((s) => s.slug)] : panelSections.map((s) => s.slug);
    const seen = new Set<string>();
    for (const slug of candidates) {
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const rail = railRefs.current[slug];
      if (!rail) continue;
      const target = rail.querySelector<HTMLElement>(`[data-shop-id=\"${shopId}\"]`);
      if (!target) continue;
      rail.scrollIntoView({ behavior: "smooth", block: "nearest" });
      target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setActiveRailSlug(slug);
      return true;
    }
    return false;
  };

  const updateRailScrollUiState = (slug: string) => {
    if (typeof window === "undefined") return;
    const rail = railRefs.current[slug];
    if (!rail) return;

    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const progress = maxScroll > 0 ? rail.scrollLeft / maxScroll : 0;
    const rawThumbPct = rail.scrollWidth > 0 ? (rail.clientWidth / rail.scrollWidth) * 100 : 100;
    const thumbPct = maxScroll > 0 ? Math.max(10, Math.min(60, rawThumbPct)) : 100;
    const atStart = rail.scrollLeft <= 1;
    const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1;

    setRailScrollUi((prev) => {
      const current = prev[slug];
      const next = {
        atStart,
        atEnd,
        progress: Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)),
        thumbPct: Math.max(1, Math.min(100, Number.isFinite(thumbPct) ? thumbPct : 100)),
      };
      if (
        current &&
        current.atStart === next.atStart &&
        current.atEnd === next.atEnd &&
        Math.abs(current.progress - next.progress) < 0.01 &&
        Math.abs(current.thumbPct - next.thumbPct) < 0.5
      ) {
        return prev;
      }
      return { ...prev, [slug]: next };
    });
  };

  const initRetailRailScroll = (slug: string, productsCount: number) => {
    if (typeof window === "undefined") return;
    if (railInitializedRef.current.has(slug)) return;
    const rail = railRefs.current[slug];
    if (!rail) return;
    if (!productsCount || productsCount <= 2) {
      railInitializedRef.current.add(slug);
      return;
    }

    const targetIdx = productsCount >= 5 ? 2 : 1;
    const target = rail.children.item(targetIdx) as HTMLElement | null;
    if (!target) {
      railInitializedRef.current.add(slug);
      return;
    }

    try {
      const left = target.offsetLeft - (rail.clientWidth / 2 - target.clientWidth / 2);
      rail.scrollTo({ left: Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, left)), behavior: "auto" });
    } catch {
      // ignore
    }

    railInitializedRef.current.add(slug);
    requestAnimationFrame(() => updateRailScrollUiState(slug));
  };

  const stopHoldRailScroll = useCallback(() => {
    if (holdScrollRef.current.delayTimerId) window.clearTimeout(holdScrollRef.current.delayTimerId);
    if (holdScrollRef.current.rafId) cancelAnimationFrame(holdScrollRef.current.rafId);
    holdScrollRef.current.slug = null;
    holdScrollRef.current.rafId = null;
    holdScrollRef.current.lastTs = null;
    holdScrollRef.current.delayTimerId = null;
  }, []);

  const startHoldRailScroll = useCallback(
    (slug: string, direction: 1 | -1) => {
      stopHoldRailScroll();
      dismissRetailScrollHint();

      holdScrollRef.current.slug = slug;
      holdScrollRef.current.direction = direction;
      holdScrollRef.current.suppressClick = false;
      holdScrollRef.current.delayTimerId = window.setTimeout(() => {
        holdScrollRef.current.delayTimerId = null;
        holdScrollRef.current.suppressClick = true;
        holdScrollRef.current.lastTs = null;

        const tick = (ts: number) => {
          const activeSlug = holdScrollRef.current.slug;
          if (!activeSlug) return;
          const rail = railRefs.current[activeSlug];
          if (!rail) {
            stopHoldRailScroll();
            return;
          }

          const last = holdScrollRef.current.lastTs;
          const dt = Math.min(32, last ? ts - last : 16);
          holdScrollRef.current.lastTs = ts;

          const speedPxPerSec = 1400;
          rail.scrollLeft += holdScrollRef.current.direction * (speedPxPerSec * dt) / 1000;
          holdScrollRef.current.rafId = window.requestAnimationFrame(tick);
        };

        holdScrollRef.current.rafId = window.requestAnimationFrame(tick);
        window.addEventListener("pointerup", stopHoldRailScroll, { once: true });
        window.addEventListener("pointercancel", stopHoldRailScroll, { once: true });
        window.addEventListener("blur", stopHoldRailScroll, { once: true });
      }, 180);
    },
    [dismissRetailScrollHint, stopHoldRailScroll],
  );

  const scrollRetailRailBy = (slug: string, direction: 1 | -1) => {
    const rail = railRefs.current[slug];
    if (!rail) return;

    dismissRetailScrollHint();
    setActiveRailSlug(slug);

    const first = rail.querySelector<HTMLElement>("[data-shop-id]") ?? (rail.firstElementChild as HTMLElement | null);
    const cardWidth = first ? first.getBoundingClientRect().width : 280;
    const styles = window.getComputedStyle(rail);
    const gapRaw = parseFloat(styles.columnGap || styles.gap || "12");
    const gap = Number.isFinite(gapRaw) ? gapRaw : 12;
    const stepPx = Math.round((Math.max(240, Math.min(340, cardWidth)) + gap) * 2.6);

    rail.scrollBy({ left: direction * stepPx, behavior: "smooth" });
  };

  const updateRetailRailScrollFromScrubber = (slug: string, clientX: number) => {
    const drag = railScrollbarDragRef.current;
    if (!drag.slug || drag.slug !== slug) return;

    const rail = railRefs.current[slug];
    if (!rail) return;

    const maxScroll = drag.maxScroll;
    if (maxScroll <= 1) return;

    const x = clientX - drag.trackLeft;
    const denom = Math.max(1, drag.trackWidth - drag.thumbWidthPx);
    const progress = (x - drag.thumbWidthPx / 2) / denom;
    const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    rail.scrollLeft = clamped * maxScroll;
    updateRailScrollUiState(slug);
  };

  const startRetailRailScrubberDrag = (slug: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRefs.current[slug];
    const track = railScrollbarTrackRefs.current[slug];
    if (!rail || !track) return;

    const maxScroll = rail.scrollWidth - rail.clientWidth;
    if (maxScroll <= 1) return;

    dismissRetailScrollHint();
    setActiveRailSlug(slug);

    const rect = track.getBoundingClientRect();
    const rawThumbPct = rail.scrollWidth > 0 ? (rail.clientWidth / rail.scrollWidth) * 100 : 100;
    const thumbPct = maxScroll > 0 ? Math.max(10, Math.min(60, rawThumbPct)) : 100;
    const thumbWidthPx = (rect.width * thumbPct) / 100;

    railScrollbarDragRef.current = {
      slug,
      pointerId: event.pointerId,
      trackLeft: rect.left,
      trackWidth: rect.width,
      thumbWidthPx,
      maxScroll,
    };

    track.setPointerCapture(event.pointerId);
    updateRetailRailScrollFromScrubber(slug, event.clientX);
  };

  const handleRetailRailScrubberMove = (slug: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = railScrollbarDragRef.current;
    if (drag.slug !== slug || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateRetailRailScrollFromScrubber(slug, event.clientX);
  };

  const stopRetailRailScrubberDrag = (slug: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = railScrollbarDragRef.current;
    if (drag.slug !== slug || drag.pointerId !== event.pointerId) return;

    try {
      railScrollbarTrackRefs.current[slug]?.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    railScrollbarDragRef.current.slug = null;
    railScrollbarDragRef.current.pointerId = null;
  };

  const startRetailRailPointerDrag = (slug: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRefs.current[slug];
    if (!rail) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("button,a,input,select,textarea,[role='button']")) return;

    railPointerDragRef.current = {
      slug,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: rail.scrollLeft,
      moved: false,
    };

    try {
      rail.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleRetailRailPointerMove = (slug: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = railPointerDragRef.current;
    if (drag.slug !== slug || drag.pointerId !== event.pointerId) return;

    const rail = railRefs.current[slug];
    if (!rail) return;

    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 4) return;

    if (!drag.moved) {
      drag.moved = true;
      dismissRetailScrollHint();
      setActiveRailSlug(slug);
    }

    event.preventDefault();
    railClickSuppressUntilRef.current = Date.now() + 260;
    rail.scrollLeft = drag.startScrollLeft - dx;
  };

  const stopRetailRailPointerDrag = (slug: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = railPointerDragRef.current;
    if (drag.slug !== slug || drag.pointerId !== event.pointerId) return;

    try {
      railRefs.current[slug]?.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    railPointerDragRef.current.slug = null;
    railPointerDragRef.current.pointerId = null;
    railPointerDragRef.current.moved = false;
  };

  const handleRetailRailWheel = (slug: string, event: WheelEvent<HTMLDivElement>) => {
    const rail = railRefs.current[slug];
    if (!rail) return;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    if (maxScroll <= 1) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!Number.isFinite(delta) || delta === 0) return;

    const next = rail.scrollLeft + delta;
    const canScroll =
      (delta > 0 && rail.scrollLeft < maxScroll - 1) || (delta < 0 && rail.scrollLeft > 1);
    if (!canScroll) return;

    event.preventDefault();
    dismissRetailScrollHint();
    setActiveRailSlug(slug);
    rail.scrollLeft = Math.max(0, Math.min(maxScroll, next));
  };

  const handleRetailRailScroll = (slug: string) => {
    setActiveRailSlug(slug);
    if (retailScrollHintState === "visible") dismissRetailScrollHint();

    if (railScrollRafRef.current) cancelAnimationFrame(railScrollRafRef.current);
    railScrollRafRef.current = window.requestAnimationFrame(() => {
      railScrollRafRef.current = null;
      updateVisibleRailShops(slug);
      updateRailScrollUiState(slug);

      if (buyerMode !== "retail") return;
      const rail = railRefs.current[slug];
      if (!rail) return;
      const nearEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - Math.max(120, rail.clientWidth * 0.2);
      if (!nearEnd) return;
      if (nearbyFetching) return;

      const now = Date.now();
      if (now - retailAutoLoadRef.current < 1200) return;
      retailAutoLoadRef.current = now;

      const defaultPerSeller = radiusKm >= 500 ? 80 : 50;
      const basePerSeller = productsPerSeller > 0 ? productsPerSeller : defaultPerSeller;
      const maxPerSeller = 2000;
      const nextPerSeller = Math.min(maxPerSeller, basePerSeller + 100);
      if (nextPerSeller > basePerSeller) {
        setProductsPerSeller(nextPerSeller);
        return;
      }

      const next = getNextRetailRadiusKm(radiusKm);
      if (next != null) setRadiusKm(next);
    });
  };
  const panelSections: Array<{
    slug: string;
    title: string;
    subtitle: string;
    limit: number;
  }> = isGoldTenant
    ? buyerMode === "wholesale"
      ? [
          { slug: "dore", title: t("sections.doreLots.title"), subtitle: t("sections.doreLots.subtitle"), limit: Number.MAX_SAFE_INTEGER },
        ]
      : MODE_CATEGORIES.retail.map((slug) => {
          if (slug === "stamped") {
            return { slug: "stamped", title: t("sections.stamped.title"), subtitle: t("sections.stamped.subtitle"), limit: Number.MAX_SAFE_INTEGER };
          }
          if (slug === "jewelry") {
            return { slug: "jewelry", title: t("sections.jewelry.title"), subtitle: t("sections.jewelry.subtitle"), limit: Number.MAX_SAFE_INTEGER };
          }
          return { slug: "gold-art", title: t("sections.goldArt.title"), subtitle: t("sections.goldArt.subtitle"), limit: Number.MAX_SAFE_INTEGER };
        })
    : (() => {
        const slugsWithItems = Object.entries(retailDisplayByCategoryResolved)
          .filter(([, items]) => Array.isArray(items) && items.length > 0)
          .map(([slug]) => slug);
        const orderedWithItems = allowedCategories.filter((slug) => slugsWithItems.includes(slug));
        const baseSlugs = orderedWithItems.length ? orderedWithItems : slugsWithItems.length ? slugsWithItems : allowedCategories;
        const slugs = effectiveCategoryFilter ? [effectiveCategoryFilter] : baseSlugs;
        const sectionCandidates = Array.from(new Set([...allowedCategories, ...slugsWithItems, ...Object.keys(retailDisplayByCategoryResolved)]));
        const normalizedCandidateMap = new Map<string, string>();
        for (const candidate of sectionCandidates) {
          const normalized = normalizeCategorySlug(candidate);
          if (normalized && !normalizedCandidateMap.has(normalized)) {
            normalizedCandidateMap.set(normalized, candidate);
          }
        }
        const resolveSectionSlug = (rawSlug: string): string | null => {
          const direct = sectionCandidates.find((candidate) => candidate === rawSlug);
          if (direct) return direct;
          const normalized = normalizeCategorySlug(rawSlug);
          if (!normalized) return null;
          const exactNormalized = normalizedCandidateMap.get(normalized);
          if (exactNormalized) return exactNormalized;
          const compact = normalized.replace(/-/g, "");
          for (const [key, candidate] of normalizedCandidateMap.entries()) {
            if (key.replace(/-/g, "") === compact) return candidate;
          }
          return null;
        };

        if (!effectiveCategoryFilter && tenantIdentity.sections.length > 0) {
          const configuredSections = tenantIdentity.sections
            .map((section) => {
              const resolvedSlug = resolveSectionSlug(section.slug);
              if (!resolvedSlug) return null;
              const hasItems = (retailDisplayByCategoryResolved[resolvedSlug] || []).length > 0;
              if (!hasItems) return null;
              const meta = getCategoryMeta(resolvedSlug);
              return {
                slug: resolvedSlug,
                title: section.title || meta.label,
                subtitle: section.subtitle || "",
                limit: Number.isFinite(section.limit) ? Number(section.limit) : Number.MAX_SAFE_INTEGER,
              };
            })
            .filter(Boolean) as Array<{ slug: string; title: string; subtitle: string; limit: number }>;

          if (configuredSections.length > 0) {
            return configuredSections;
          }
        }

        return slugs.map((slug) => {
          const meta = getCategoryMeta(slug);
          return {
            slug,
            title: meta.label,
            subtitle: "",
            limit: Number.MAX_SAFE_INTEGER,
          };
        });
      })();

  const panelPreviewProducts = (() => {
    if (buyerMode === "wholesale") {
      if (isGoldTenant) return panelByCategory.dore ?? [];
      return sortedPanelSourceProducts;
    }
    if (isGoldTenant) {
      const categoriesInMode = MODE_CATEGORIES[buyerMode] || [];
      const merged: any[] = [];
      for (const slug of categoriesInMode) {
        const items = panelByCategory[slug] ?? [];
        if (!items.length) continue;
        const limit = slug === "stamped" ? 12 : 4;
        merged.push(...items.slice(0, limit));
      }
      return merged;
    }
    return sortedPanelSourceProducts;
  })();
  const panelPreviewTrimmed = panelPreviewProducts.slice(0, 12);

  const selectedProductPrice = selectedProduct ? getProductPriceDisplay(selectedProduct) : null;
  const selectedProductStock = selectedProduct ? getProductStockLabel(selectedProduct) : { text: "", inStock: false };
  const selectedShopCategory = selectedShop ? getShopPrimaryCategory(selectedShop) : null;
  const selectedShopCategoryMeta = selectedShopCategory ? getCategoryMeta(selectedShopCategory) : null;
  const selectedShopLocationLabel = selectedShop
    ? [selectedShop.cityName, selectedShop.countryName].filter(Boolean).join(", ") ||
      selectedShop.streetAddress ||
      DEFAULT_COUNTRY
    : DEFAULT_COUNTRY;
  const selectedShopDistanceLabel = selectedShop?.distanceText ? `${selectedShop.distanceText} away` : null;
  const selectedShopIsJeweler =
    !!selectedShop &&
    (selectedShop.sellerType === "jeweler" || selectedShop.productionType === "jewelry_manufacturing");
  const selectedShopWaDigits =
    !isWholesalePreview && selectedShopIsJeweler && typeof selectedShop?.phoneNumber === "string"
      ? selectedShop.phoneNumber.replace(/\D/g, "")
      : "";
  const selectedShopWaHref =
    !isWholesalePreview && selectedShopIsJeweler && whatsappEnabled && selectedShopWaDigits
      ? `https://wa.me/${selectedShopWaDigits}?text=${encodeURIComponent(
          `Hello ${selectedShop.shopName}, I'm interested in your catalog on ${tenant.name}.`,
        )}`
      : null;
  const selectedProductImages = selectedProduct ? getProductImages(selectedProduct) : [];
  const selectedProductPrimaryImage =
    selectedProductImages[Math.min(selectedProductImageIndex, Math.max(selectedProductImages.length - 1, 0))] || null;
  const selectedProductTags = selectedProduct ? getSecondaryTags(selectedProduct) : [];

  useEffect(() => {
    setSelectedProductImageIndex(0);
  }, [selectedProduct?.id]);

  const tickerItems = (
    <>
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-white/90 transition-colors"
        onClick={() => navigate("/app")}
        title="Ouvrir l'app Pro"
      >
        <Bot className="h-3.5 w-3.5 text-amber-300" />
        <span className="text-[10px] font-semibold whitespace-nowrap">Ouvrir l'app Pro</span>
      </button>

      {goldPrice ? (
        <>
      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20">
        <span className="text-[9px] leading-none font-bold text-amber-400 whitespace-nowrap">Au</span>
        <span className="text-[9px] leading-none font-semibold text-amber-400 whitespace-nowrap">
          {platformStats?.formattedTotal || "8 tonnes"}
        </span>
        <span className="text-[8px] leading-none text-amber-300 whitespace-nowrap">on platform</span>
      </div>

      <div className="h-4 w-px bg-white/20" />

      <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 rounded-lg border border-amber-500/20">
        <Activity className="h-3 w-3 text-amber-400" />
        <span className="text-[10px] font-semibold text-amber-400 whitespace-nowrap">{t("ticker.lbmaGold")}</span>
        <span className="text-[10px] text-white font-bold">
          {formatAmount(parseFloat(goldPrice.lbma?.priceUSD || "0"), "USD", t("price.perOz"))}
        </span>
        {goldPrice.lbma?.isUp ? (
          <TrendingUp className="h-3 w-3 text-emerald-400" />
        ) : (
          <TrendingDown className="h-3 w-3 text-rose-400" />
        )}
        <span className={`text-[9px] ${goldPrice.lbma?.isUp ? "text-emerald-400" : "text-rose-400"}`}>
          {goldPrice.lbma?.isUp ? "+" : ""}
          {goldPrice.lbma?.change24h}%
        </span>
      </div>

      <div className="h-4 w-px bg-white/20" />

      {buyerMode === "wholesale" && (
        <div className="flex items-center gap-1.5 px-2">
          <span className="text-[9px] text-orange-400 font-medium whitespace-nowrap">{t("product.dore").toUpperCase()}</span>
          <span className="text-[10px] text-white/90 font-semibold whitespace-nowrap">
            {parseInt(goldPrice.international?.dore?.priceXOF || "0") > 0
              ? formatMoney(parseInt(goldPrice.international?.dore?.priceXOF || "0"), "XOF", "/g")
              : "Quote"}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2">
        <span className="text-[9px] text-blue-400 font-medium whitespace-nowrap">22K</span>
        <span className="text-[10px] text-white/90 font-semibold whitespace-nowrap">
          {formatMoney(parseInt(goldPrice.international?.refined22K?.priceXOF || "0"), "XOF", "/g")}
        </span>
      </div>

      <div className="flex items-center gap-1.5 px-2">
        <span className="text-[9px] text-indigo-300 font-medium whitespace-nowrap">18K</span>
        <span className="text-[10px] text-white/90 font-semibold whitespace-nowrap">
          {formatMoney(parseInt(goldPrice.international?.refined18K?.priceXOF || "0"), "XOF", "/g")}
        </span>
      </div>

      <div className="h-4 w-px bg-white/20" />

      {buyerMode === "wholesale" && (
        <div className="flex items-center gap-1.5 px-2">
          <span className="text-[9px] text-orange-300 whitespace-nowrap">Local {t("product.dore")}</span>
          <span className="text-[10px] text-white/90 font-semibold whitespace-nowrap">
            {parseInt(goldPrice.local?.dore?.priceXOF || "0") > 0
              ? formatMoney(parseInt(goldPrice.local?.dore?.priceXOF || "0"), "XOF", "/g")
              : "Quote"}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2">
        <span className="text-[9px] text-blue-300 whitespace-nowrap">Local 22K</span>
        <span className="text-[10px] text-white/90 font-semibold whitespace-nowrap">
          {formatMoney(parseInt(goldPrice.local?.refined22K?.priceXOF || "0"), "XOF", "/g")}
        </span>
      </div>

      <div className="flex items-center gap-1.5 px-2">
        <span className="text-[9px] text-indigo-200 whitespace-nowrap">Local 18K</span>
        <span className="text-[10px] text-white/90 font-semibold whitespace-nowrap">
          {formatMoney(parseInt(goldPrice.local?.refined18K?.priceXOF || "0"), "XOF", "/g")}
        </span>
      </div>
        </>
      ) : null}
    </>
  );

  const visibleMachinery = filterMachinery(MACHINERY_ITEMS, machineryFilters);
  const mappedLiveOpportunities: InvestmentOpportunity[] = useMemo(() => {
    return liveCadastreOpportunities.map((row, index) => {
      const cadastreName = String(row.cadastre_name || "").trim() || "MISSING CADASTRE NAME - FIX";
      const region = String(row.region || "Unknown");
      const capacityKgMonth = Number(row.current_capacity_kg_month || 0);
      const monthlyFromProduction = Number(row.production_30d_g || 0) / 1000;
      const effectiveCapacity = capacityKgMonth > 0 ? capacityKgMonth : monthlyFromProduction;
      const capitalRequiredUsd = Number(row.capital_required_usd || 0);
      const durationMonths = Number(row.duration_months || 9);

      return {
        id: `cadastre-opportunity-${row.id}`,
        type: "investment",
        title: cadastreName,
        mineId: `cadastre-site-${row.id}`,
        mineVerificationStatus: cadastreStatusToMineVerification(row.status),
        location: {
          country: "Cote d'Ivoire",
          region,
          city: region,
          lat: Number(row.lat || 7.54 + index * 0.01),
          lng: Number(row.lng || -5.55 + index * 0.01),
        },
        capitalRequired: {
          amount: capitalRequiredUsd > 0 ? capitalRequiredUsd : Math.max(95_000, Math.round(effectiveCapacity * 900 + 85_000)),
          currency: "USD",
        },
        durationMonths: durationMonths > 0 ? durationMonths : 9,
        returnModelLabel: cadastreName,
        returnIndicativeRange: undefined,
        capitalUse: [
          {
            label: String(row.permit_number || "").trim()
              ? `Permit ${String(row.permit_number).trim()} operationalization`
              : "Cadastre permit operationalization",
          },
        ],
      };
    });
  }, [liveCadastreOpportunities]);

  const cadastreBaselineOpportunities = mappedLiveOpportunities;

  const supportedCadastreCountries = useMemo(() => {
    const fromLive = Array.from(new Set(mappedLiveOpportunities.map((o) => o.location.country))).sort();
    if (fromLive.length) return fromLive;
    return ["Cote d'Ivoire"];
  }, [mappedLiveOpportunities]);

  const cadastreCountryUnavailable =
    investmentFilters.country !== "all" && !supportedCadastreCountries.includes(investmentFilters.country);

  const visibleOpportunities = cadastreCountryUnavailable
    ? []
    : filterOpportunities(mappedLiveOpportunities, investmentFilters);

  const machineryCountries = Array.from(new Set(MACHINERY_ITEMS.map((m) => m.location.country))).sort();
  const machineryRegions = Array.from(new Set(MACHINERY_ITEMS.map((m) => m.location.region))).sort();
  const opportunityCountries = Array.from(new Set(cadastreBaselineOpportunities.map((o) => o.location.country))).sort();
  const opportunityRegions = Array.from(new Set(cadastreBaselineOpportunities.map((o) => o.location.region))).sort();

  const machineryRegionsForCountry =
    machineryFilters.country === "all"
      ? machineryRegions
      : Array.from(
          new Set(
            MACHINERY_ITEMS.filter((m) => m.location.country === machineryFilters.country).map((m) => m.location.region)
          )
        ).sort();
  const opportunityRegionsForCountry =
    investmentFilters.country === "all"
      ? opportunityRegions
      : Array.from(
          new Set(
            cadastreBaselineOpportunities
              .filter((o) => o.location.country === investmentFilters.country)
              .map((o) => o.location.region)
          )
        ).sort();

  const cadastrePermitsForMap = useMemo(() => {
    if (cadastreCountryUnavailable) return [] as Array<CadastrePermit & { riskLevel?: string; siteType?: string }>;
    const region = investmentFilters.region === "all" ? null : investmentFilters.region;
    if (cadastreMapItems.length) {
      return cadastreMapItems
        .filter((item) => (region ? String(item.region || "").trim() === region : true))
        .map((item) => {
          const lat = Number(item.lat || 0);
          const lng = Number(item.lng || 0);
          const permitId = String(item.permit_number || "").trim() || `CI-${String(item.id).slice(0, 8)}`;
          const status = normalizeCadastreStatus(item.status);
          return {
            permitId,
            country: "Cote d'Ivoire",
            region: String(item.region || "Unknown"),
            holderName: String(item.cadastre_name || "").trim() || "MISSING CADASTRE NAME - FIX",
            permitType: String(item.site_type || "UNKNOWN"),
            permitStatus: cadastreStatusToPermitStatus(status),
            commodity: "Gold",
            sourceUrl:
              String(item.source_ref || "").startsWith("http")
                ? String(item.source_ref)
                : "https://portals.landfolio.com/CoteDIvoire/FR/",
            geometry: makeFallbackPermitPolygon(lat, lng),
            centroid: { lat, lng },
            geometryHash: String(item.id || permitId),
            lastSyncAt: String(item.last_report_date || new Date().toISOString()),
            licenseActiveSinceYear:
              Number.isFinite(new Date(String(item.last_report_date || "")).getUTCFullYear())
                ? new Date(String(item.last_report_date)).getUTCFullYear()
                : new Date().getUTCFullYear(),
            riskLevel: normalizeCadastreStatus(item.risk_level) || "MEDIUM",
            siteType: normalizeCadastreStatus(item.site_type) || "UNKNOWN",
            cadastreStatus: status || "PENDING",
          } as CadastrePermit & { riskLevel?: string; siteType?: string; cadastreStatus?: string };
        });
    }

    return [] as Array<CadastrePermit & { riskLevel?: string; siteType?: string }>;
  }, [cadastreCountryUnavailable, cadastreMapItems, investmentFilters.country, investmentFilters.region]);

  const cadastreCountries = useMemo(() => {
    if (cadastreMapItems.length) return ["Cote d'Ivoire"];
    return ["Cote d'Ivoire"];
  }, [cadastreMapItems]);
  const cadastrePermitResults = useMemo(() => {
    const list = cadastreMapItems.map((item) => {
      const lat = Number(item.lat || 0);
      const lng = Number(item.lng || 0);
      const permitId = String(item.permit_number || "").trim() || `CI-${String(item.id).slice(0, 8)}`;
      return {
        permitId,
        country: "Cote d'Ivoire",
        region: String(item.region || "Unknown"),
        holderName: String(item.cadastre_name || "").trim() || "MISSING CADASTRE NAME - FIX",
        permitType: String(item.site_type || "UNKNOWN"),
        permitStatus: cadastreStatusToPermitStatus(item.status),
        commodity: "Gold",
        sourceUrl:
          String(item.source_ref || "").startsWith("http")
            ? String(item.source_ref)
            : "https://portals.landfolio.com/CoteDIvoire/FR/",
        geometry: makeFallbackPermitPolygon(lat, lng),
        centroid: { lat, lng },
        geometryHash: String(item.id || permitId),
        lastSyncAt: String(item.last_report_date || new Date().toISOString()),
        licenseActiveSinceYear:
          Number.isFinite(new Date(String(item.last_report_date || "")).getUTCFullYear())
            ? new Date(String(item.last_report_date)).getUTCFullYear()
            : new Date().getUTCFullYear(),
      } as CadastrePermit;
    });
    const q = normalizeForMatch(cadastreSearch);
    return list.filter((permit) => {
      if (!q) return true;
      const hay = normalizeForMatch(
        `${permit.permitId} ${permit.holderName} ${permit.permitType} ${permit.permitStatus} ${permit.region}`
      );
      return hay.includes(q);
    });
  }, [cadastreMapItems, cadastreSearch]);

  const isVerifiedInvestor =
    session.hasRole("verified_investor") || session.hasRole("shareholder") || session.hasRole("admin");
  const isOperator = session.hasRole("operator") || session.hasRole("admin");
  const isDesktopViewport = typeof window !== "undefined" ? window.innerWidth >= 768 : !isMobile;
  const isDesktopRetail = isDesktopViewport && buyerMode === "retail";
  const isDesktopRetailBrowse = isDesktopRetail && marketMode === "marketplace";
  const showFeedView = isFeedMode && !isDesktopViewport && (!mapEnabled || !mapOverlayOpen);
  const showMapOverlay = mapEnabled && (buyerMode === "wholesale" ? isDesktopViewport || mapOverlayOpen : mapOverlayOpen);
  const navActiveKey =
    vaultOpen ? (vaultPane === "vault" ? "vault" : "wallet") : mapEnabled && mapOverlayOpen ? "map" : "browse";

  useEffect(() => {
    if (!mapEnabled || !showMapOverlay) return;
    if (leafletDeps) return;

    let cancelled = false;

    (async () => {
      try {
        const [, leafletModule, reactLeaflet] = await Promise.all([
          import("leaflet/dist/leaflet.css"),
          import("leaflet"),
          import("react-leaflet"),
        ]);

        const L = (leafletModule as any)?.default ?? leafletModule;

        try {
          delete (L.Icon.Default.prototype as any)._getIconUrl;
          L.Icon.Default.mergeOptions({
            iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
            iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
            shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
          });
        } catch {
          // ignore
        }

        if (cancelled) return;
        setLeafletDeps({
          L,
          MapContainer: (reactLeaflet as any).MapContainer,
          TileLayer: (reactLeaflet as any).TileLayer,
          Marker: (reactLeaflet as any).Marker,
          Popup: (reactLeaflet as any).Popup,
          Circle: (reactLeaflet as any).Circle,
          Polygon: (reactLeaflet as any).Polygon,
          useMap: (reactLeaflet as any).useMap,
        });
      } catch {
        // Non-blocking: map is optional.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [leafletDeps, showMapOverlay, mapEnabled]);

  useEffect(() => {
    if (!isDesktopRetail || !mapEnabled) return;
    if (!mapOverlayOpen) setMapOverlayOpen(true);
  }, [isDesktopRetail, mapOverlayOpen, mapEnabled]);

  useEffect(() => {
    if (!isDesktopRetail) {
      if (retailScrollHintState !== "hidden") setRetailScrollHintState("hidden");
      return;
    }
    if (retailScrollHintState !== "hidden") return;
    const dismissed = safeLocalStorageGet(retailScrollHintStorageKey);
    if (dismissed === "true") return;
    setRetailScrollHintState("visible");
  }, [isDesktopRetail, retailScrollHintState, retailScrollHintStorageKey]);

  useEffect(() => {
    if (!isDesktopRetail) return;
    if (selectedCategory) setActiveRailSlug(selectedCategory);
  }, [isDesktopRetail, selectedCategory]);

  useEffect(() => {
    if (!isDesktopRetail) return;
    const slug = selectedCategory || activeRailSlug || panelSections[0]?.slug;
    if (!slug) return;
    if (!activeRailSlug) setActiveRailSlug(slug);
    requestAnimationFrame(() => updateVisibleRailShops(slug));
  }, [isDesktopRetail, selectedCategory, activeRailSlug, panelSections.length, shops.length]);

  useEffect(() => {
    if (isDesktopViewport || !mapEnabled) return;
    if (buyerMode === "retail") return;
    if (showFeedView || showMapOverlay) return;
    setMapOverlayOpen(true);
  }, [isDesktopViewport, buyerMode, showFeedView, showMapOverlay, mapEnabled]);
  const isAuthedUser = session.isAuthenticated && !session.isGuest;
  const conciergeNeedsLift = Boolean(
    isMobile &&
      (selectedProduct ||
        selectedMachinery ||
        selectedOpportunity ||
        selectedShop ||
        cartOpen ||
        checkoutOpen ||
        vaultOpen ||
        showFeedView ||
        (showProducts && (marketMode === "machinery" || marketMode === "investments")))
  );
  const conciergeExtraOffset = conciergeNeedsLift ? 84 : 16;
  const conciergeBottomOffset = isMobile
    ? `calc(var(--bottom-stack-height) + ${conciergeExtraOffset}px)`
    : "16px";
  const modeStackBottomOffset = isMobile ? `calc(var(--bottom-stack-height) + ${conciergeExtraOffset + 72}px)` : "16px";
  const modalBlockingConcierge =
    contractPreviewOpen ||
    participateOpen ||
    bdoPurchaseOpen ||
    bdoSecondaryOpen ||
    wholesaleApplyOpen ||
    customEquipmentOpen ||
    mineListingOpen;
  const conciergeIsHidden = conciergeOpen || conciergeHidden || modalBlockingConcierge;
  const renderDebugEnabled = (() => {
    if (!import.meta.env.DEV) return false;
    try {
      return localStorage.getItem("bdo_debug_render") === "true";
    } catch {
      return false;
    }
  })();
  const renderDebugState = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!modeStackExpanded) return;
    if (!isMobile) {
      setModeStackExpanded(false);
      return;
    }
    if (modalBlockingConcierge || cartOpen || vaultOpen || checkoutOpen || selectedProduct || selectedMachinery || selectedOpportunity) {
      setModeStackExpanded(false);
    }
  }, [
    modeStackExpanded,
    isMobile,
    modalBlockingConcierge,
    cartOpen,
    vaultOpen,
    checkoutOpen,
    selectedProduct,
    selectedMachinery,
    selectedOpportunity,
  ]);

  useEffect(() => {
    if (!renderDebugEnabled) return;
    const next: Record<string, unknown> = {
      marketMode,
      buyerMode,
      mapOverlayOpen,
      showFeedView,
      conciergeOpen,
      cartOpen,
      vaultOpen,
      checkoutOpen,
      selectedProduct: Boolean(selectedProduct),
      selectedMachinery: Boolean(selectedMachinery),
      selectedOpportunity: Boolean(selectedOpportunity),
      locationSource,
      userPosition: `${userPosition[0]},${userPosition[1]}`,
    };
    const prev = renderDebugState.current;
    if (!prev) {
      console.debug("[debug] BuyerHomePage render init", next);
      renderDebugState.current = next;
      return;
    }
    const changed = Object.keys(next).filter((key) => prev[key] !== next[key]);
    if (changed.length) {
      console.debug("[debug] BuyerHomePage render causes:", changed, next);
    }
    renderDebugState.current = next;
  }, [
    renderDebugEnabled,
    marketMode,
    buyerMode,
    mapOverlayOpen,
    showFeedView,
    conciergeOpen,
    cartOpen,
    vaultOpen,
    checkoutOpen,
    selectedProduct,
    selectedMachinery,
    selectedOpportunity,
    locationSource,
    userPosition,
	  ]);
	  const walletBalanceLabel =
	    session.isAuthenticated && !session.isGuest
	      ? walletSummaryLoading
	        ? "..."
	        : formatMoney(Number(walletSummary?.wallet?.balance || 0), "XOF")
	      : null;
	  const walletTransactions = Array.isArray(walletSummary?.recent) ? walletSummary.recent : [];
	  const accountMenu = session.isAuthenticated ? (
	    <>
	      <DropdownMenuLabel className="font-normal">
        <div className="flex flex-col space-y-1">
          <p className="text-sm font-medium">{session.user?.displayName}</p>
          <p className="text-xs text-gray-400">{session.user?.email}</p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator className="bg-gray-700" />
      <DropdownMenuItem className="cursor-pointer hover:bg-gray-800" onClick={() => navigate("/profile")}>
        <UserCircle className="h-4 w-4 mr-2" />
        Account
      </DropdownMenuItem>
      {session.hasRole("admin") && (
        <DropdownMenuItem className="cursor-pointer hover:bg-gray-800" onClick={() => navigate("/admin")}>
          <Settings className="h-4 w-4 mr-2" />
          Admin Console
        </DropdownMenuItem>
      )}
    </>
  ) : (
    <>
      <DropdownMenuLabel>Guest</DropdownMenuLabel>
      <DropdownMenuSeparator className="bg-gray-700" />
      <DropdownMenuItem className="cursor-pointer hover:bg-gray-800" onClick={() => navigate("/login")}>
        <LogIn className="h-4 w-4 mr-2" />
        Login
      </DropdownMenuItem>
      <DropdownMenuItem className="cursor-pointer hover:bg-gray-800" onClick={() => navigate("/register")}>
        <UserCircle className="h-4 w-4 mr-2" />
        Register
      </DropdownMenuItem>
    </>
  );
  const signOutMenuItem = session.isAuthenticated ? (
    <>
      <DropdownMenuSeparator className="bg-gray-700" />
      <DropdownMenuItem
        className="cursor-pointer hover:bg-gray-800 text-red-400"
        onClick={() => {
          session.logout();
          queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/wallet"] });
          toast({ title: t("auth.signedOutTitle"), description: t("auth.signedOutDescription") });
        }}
      >
        <LogOut className="h-4 w-4 mr-2" />
        {t("common.signOut")}
      </DropdownMenuItem>
    </>
  ) : null;

  if (showVerificationGate) {
    return (
      <div className="min-h-screen bg-black text-white">
        <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10 safe-area-top">
          <div className="w-full px-4 md:px-6 lg:px-8 py-3 flex items-center justify-between">
            <BrandLockup subtitle={isMobile ? undefined : t("header.subtitle")} />
          </div>
        </header>
        <div className="max-w-xl mx-auto px-4 pt-24">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {session.isAuthenticated ? t("auth.verificationRequired") : t("auth.signInToAccessExportunity")}
                </h2>
                <p className="text-sm text-white/60 mt-2">
                  {session.isAuthenticated
                    ? t("auth.completeVerificationToUnlockExportunity")
                    : t("auth.exportunityRequiresVerifiedAccount")}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {!session.isAuthenticated ? (
                  <>
                    <Button className="flex-1 bg-amber-500 text-black hover:bg-amber-600" onClick={() => navigate("/login")}>
                      {t("common.signIn")}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
                      onClick={() => navigate("/register")}
                    >
                      {t("common.createAccount")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button className="flex-1 bg-amber-500 text-black hover:bg-amber-600" onClick={() => navigate("/application-status")}>
                      {t("auth.startVerification")}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
                      onClick={() => session.logout()}
                    >
                      {t("common.signOut")}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const shouldFilterRetailMap = buyerMode === "retail" && isDesktopRetailBrowse && visibleRailShopIds.length > 0;
  const visibleRailShopSet = shouldFilterRetailMap ? new Set<number>(visibleRailShopIds) : null;
  const mapShops =
    shouldFilterRetailMap && visibleRailShopSet ? shops.filter((shop: any) => visibleRailShopSet.has(shop.id)) : shops;

  const mapFitPoints: Array<[number, number]> | null = shouldFilterRetailMap
    ? (() => {
        const points: Array<[number, number]> = [[userPosition[0], userPosition[1]]];
        for (const shop of mapShops) {
          const rawLat = parseFloat(shop?.latitude?.toString() || "");
          const rawLng = parseFloat(shop?.longitude?.toString() || "");
          if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) continue;
          if (Math.abs(rawLat) > 90 || Math.abs(rawLng) > 180) continue;
          points.push([rawLat, rawLng]);
        }
        return points.length > 1 ? points : null;
      })()
    : null;

  const hoveredShopPoint: [number, number] | null =
    buyerMode === "retail" && isDesktopRetailBrowse && hoveredRailShopId != null
      ? (() => {
          const shop = shops.find((s: any) => Number(s?.id) === hoveredRailShopId);
          if (!shop) return null;
          const rawLat = parseFloat(shop?.latitude?.toString() || "");
          const rawLng = parseFloat(shop?.longitude?.toString() || "");
          if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return null;
          if (Math.abs(rawLat) > 90 || Math.abs(rawLng) > 180) return null;
          return [rawLat, rawLng];
        })()
      : null;

  const generateZoguelandStory = useCallback(async () => {
    const character = storyCharacter.trim();
    const world = storyWorld.trim();
    const mission = storyMission.trim();
    if (!character || !world || !mission) {
      toast({
        title: "Complete all fields",
        description: "Character, world, and mission are required.",
        variant: "destructive",
      });
      return;
    }

    setStoryLoading(true);
    try {
      const response = await fetch(resolveApiUrl("/api/zogueland/story-generator"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getDemoModeHeaders(),
        },
        body: JSON.stringify({
          character,
          world,
          mission,
          tone: storyTone,
          length: storyLength,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.title || !payload?.story) {
        throw new Error(payload?.message || "Unable to generate a story right now.");
      }

      setStoryResult({
        title: String(payload.title),
        story: String(payload.story),
        safetyLabel: payload?.safetyLabel ? String(payload.safetyLabel) : null,
      });
      toast({
        title: "Story generated",
        description: "Your Zogueland story is ready.",
      });
    } catch (error: any) {
      toast({
        title: "Story generation failed",
        description: error?.message || "Try again in a few seconds.",
        variant: "destructive",
      });
    } finally {
      setStoryLoading(false);
    }
  }, [storyCharacter, storyLength, storyMission, storyTone, storyWorld, toast]);

  const showAdminDebugBanner = (() => {
    if (!session.isAuthenticated) return false;
    if (!(session.user?.currentMode === "admin" || session.hasRole("admin"))) return false;
    try {
      const qs = location.includes("?") ? location.split("?")[1] : "";
      const params = new URLSearchParams(qs);
      const raw = params.get("debug");
      if (!raw) return false;
      const v = raw.trim().toLowerCase();
      return v === "1" || v === "true" || v === "yes" || v === "on";
    } catch {
      return false;
    }
  })();
  const storefrontTheme = tenantConfig?.storefrontTheme;
  const heroGradientStyle = useMemo(() => {
    const from = storefrontTheme?.heroBanner?.gradientFrom;
    const to = storefrontTheme?.heroBanner?.gradientTo;
    if (from && to) {
      return {
        backgroundImage: `linear-gradient(90deg, ${from} 0%, ${to} 100%)`,
      } as const;
    }
    return undefined;
  }, [storefrontTheme?.heroBanner?.gradientFrom, storefrontTheme?.heroBanner?.gradientTo]);

  return (
    <div
      data-ui={uiMarker}
      data-tenant={tenant.key}
      className="relative h-[100dvh] w-full overflow-hidden"
      style={{
        background: storefrontTheme?.background,
        color: storefrontTheme?.colors?.text,
        fontFamily: storefrontTheme?.typography,
      }}
      onTouchStart={handlePrimaryTouchStart}
      onTouchEnd={handlePrimaryTouchEnd}
    >
      {showAdminDebugBanner ? (
        <div className="fixed top-[calc(env(safe-area-inset-top,0px)+76px)] right-3 z-[110] w-[320px] rounded-xl border border-white/10 bg-black/60 backdrop-blur-md p-3 text-[11px] text-white/80 shadow-2xl">
          <div className="font-semibold text-white">Debug (admin)</div>
          <div className="mt-1 space-y-1 text-white/70">
            <div>
              Tenant: <span className="text-white/90">{tenant.key}</span> • Mode:{" "}
              <span className="text-white/90">{buyerMode}</span>/<span className="text-white/90">{marketMode}</span>
            </div>
            <div>
              Location: <span className="text-white/90">{activeLocationLabel || "—"}</span>
            </div>
            <div>
              Source: <span className="text-white/90">{locationSource}</span> • Permission:{" "}
              <span className="text-white/90">{locationPermissionState}</span>
              {locationUsedFallback ? <span className="text-white/50"> • fallback</span> : null}
            </div>
            <div>
              Coords:{" "}
              <span className="text-white/90">{formatCoordsLabel(userPosition[0], userPosition[1], 5) || "—"}</span>
            </div>
            {locationLastError ? (
              <div className="text-rose-200">
                Last error: <span className="text-rose-100">{locationLastError.kind}</span>
              </div>
            ) : null}
            <div>
              Category: <span className="text-white/90">{selectedCategory || "all"}</span> • Radius:{" "}
              <span className="text-white/90">{radiusKm}km</span>
            </div>
            <div>
              Shops: <span className="text-white/90">{shops.length}</span> • Nearby products:{" "}
              <span className="text-white/90">{sortedPanelSourceProducts.length}</span>
            </div>
            <div className="pt-1">
              <Button
                size="sm"
                variant="secondary"
                className="w-full bg-white/10 hover:bg-white/15 text-white"
                onClick={() => {
                  setLocationPromptMode("prompt");
                  setLocationPromptOpen(true);
                }}
              >
                Open location tools
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {locationPromptOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
          <Card className="w-full max-w-md bg-[#0b0f14] border-white/10">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-500/15 text-amber-200 flex items-center justify-center">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-white">{t("location.title")}</h2>
                  <p className="text-sm text-white/60">{locationHelpText}</p>
                </div>
              </div>

              {locationSource === "ip" && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                  <div className="font-semibold text-white">{t("location.approx.title")}</div>
                  <div>{t("location.approx.description")}</div>
                </div>
              )}

              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-white">Current</div>
                  <div className="text-white/60">{locationSource.toUpperCase()}</div>
                </div>
                <div className="mt-1 text-white/80">{activeLocationLabel || "—"}</div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/55">
                  <div>
                    Permission: <span className="text-white/70">{locationPermissionState}</span>
                    {locationUsedFallback ? <span className="text-white/40"> • fallback</span> : null}
                  </div>
                  <Link href="/debug/location" className="text-amber-300 hover:text-amber-200 underline">
                    Debug
                  </Link>
                </div>
                {locationLastError ? (
                  <div className="mt-2 text-rose-200">
                    Last error: <span className="text-rose-100">{locationLastError.kind}</span>
                    {locationLastError.message ? (
                      <div className="mt-1 text-rose-200/80 break-words">{locationLastError.message}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  onClick={handleEnableLocation}
                  disabled={locationRequesting}
                >
                  {locationRequesting
                    ? t("location.status.updating")
                    : locationPromptMode === "prompt"
                      ? t("location.enable")
                      : t("location.retry")}
                </Button>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-xs font-semibold text-white">Manual preset</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {MANUAL_LOCATION_PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        size="sm"
                        variant="outline"
                        className="border-white/15 text-white/80 hover:bg-white/10"
                        onClick={() => handleUseManualLocation(preset)}
                        disabled={locationRequesting}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-white/15 text-white/80 hover:bg-white/10"
                  onClick={handleUseApproxLocation}
                  disabled={locationRequesting}
                >
                  Use approximate location
                </Button>

                <Button
                  variant="ghost"
                  className="w-full text-white/60 hover:text-white"
                  onClick={dismissLocationPrompt}
                  disabled={locationRequesting}
                >
                  {t("common.notNow")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {effectiveStorefrontHero ? (
        <div className="pointer-events-none relative z-[32] px-4 md:px-6 lg:px-8 pt-2 md:pt-3">
          <div
            className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-gradient-to-r from-[#0b1324] via-[#15263f] to-[#1f3b5f] p-4 md:p-5 shadow-xl"
            style={heroGradientStyle}
          >
            {effectiveStorefrontHero.eyebrow ? (
              <p className="mb-1 text-[10px] uppercase tracking-[0.24em] text-white/70 md:text-[11px]">
                {effectiveStorefrontHero.eyebrow}
              </p>
            ) : null}
            <h1 className="text-lg font-bold text-white md:text-2xl">{effectiveStorefrontHero.title}</h1>
            <p className="mt-1 text-xs text-white/75 md:text-sm">{effectiveStorefrontHero.subtitle}</p>
          </div>
        </div>
      ) : null}

      {hasZoguelandStoryGenerator ? (
        <div className="relative z-[32] px-4 md:px-6 lg:px-8 mt-2">
          <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-[#0f172a]/90 p-4 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/80 md:text-[11px]">Story Generator</p>
                <h2 className="text-base font-semibold text-white md:text-lg">Create Your Story</h2>
                <p className="mt-1 text-xs text-white/70">Character + world + mission. Child-safe output for Zogueland.</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Input
                value={storyCharacter}
                onChange={(event) => setStoryCharacter(event.target.value)}
                placeholder="Character"
                className="border-white/15 bg-black/30 text-white placeholder:text-white/50"
              />
              <Input
                value={storyWorld}
                onChange={(event) => setStoryWorld(event.target.value)}
                placeholder="World"
                className="border-white/15 bg-black/30 text-white placeholder:text-white/50"
              />
              <Input
                value={storyMission}
                onChange={(event) => setStoryMission(event.target.value)}
                placeholder="Mission"
                className="border-white/15 bg-black/30 text-white placeholder:text-white/50"
              />
            </div>

            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <Input
                value={storyTone}
                onChange={(event) => setStoryTone(event.target.value)}
                placeholder="Tone (curious, brave, playful)"
                className="border-white/15 bg-black/30 text-white placeholder:text-white/50"
              />
              <select
                value={storyLength}
                onChange={(event) => setStoryLength((event.target.value as "short" | "medium" | "long") || "medium")}
                className="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white"
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
              <Button
                type="button"
                className="h-10 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                onClick={generateZoguelandStory}
                disabled={storyLoading}
              >
                {storyLoading ? "Generating..." : "Generate Story"}
              </Button>
            </div>

            {storyResult ? (
              <div className="mt-3 rounded-xl border border-cyan-300/25 bg-cyan-950/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">{storyResult.title}</h3>
                  {storyResult.safetyLabel ? (
                    <span className="rounded-full border border-cyan-300/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-100">
                      {storyResult.safetyLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/85 md:text-sm">{storyResult.story}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showMapOverlay && (
        <div
          className={
            isDesktopRetailBrowse
              ? "absolute z-30 w-[360px] left-3 bottom-3 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950/60 md:top-[calc(env(safe-area-inset-top,0px)+132px)] lg:top-[calc(env(safe-area-inset-top,0px)+116px)]"
              : isDesktopViewport
                ? "absolute inset-0 z-0"
                : "absolute inset-0 z-20 pt-[calc(env(safe-area-inset-top,0px)+56px)] pb-[calc(var(--bottom-stack-height)+8px)]"
          }
          style={conciergeOpen && isMobile ? { pointerEvents: "none" } : undefined}
        >
          <div className="h-full w-full overflow-hidden">
            {!leafletDeps ? (
              <div className="h-full w-full bg-slate-950/60 flex items-center justify-center">
                <div className="text-xs text-white/60">Loading map…</div>
              </div>
            ) : (
              (() => {
                const { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, useMap, L } = leafletDeps;

                return (
                  <MapContainer
                    center={userPosition}
                    zoom={mapZoom}
                    className="h-full w-full"
                    style={{ background: "#0f172a" }}
                    zoomControl={false}
                  >
                    <LocationUpdater
                      position={userPosition}
                      zoom={locationSource === "gps" ? 13 : locationSource === "manual" ? 12 : 9}
                      useMap={useMap}
                    />
                    <MapResizer
                      depsKey={`${marketMode}:${buyerMode}:${mapOverlayOpen ? "1" : "0"}:${isDesktopViewport ? "1" : "0"}:${isDesktopRetailBrowse ? "1" : "0"}:${conciergeOpen ? "1" : "0"}`}
                      useMap={useMap}
                    />
                    <MapAutoSizer
                      depsKey={`${marketMode}:${buyerMode}:${mapOverlayOpen ? "1" : "0"}:${isDesktopViewport ? "1" : "0"}:${isDesktopRetailBrowse ? "1" : "0"}:${conciergeOpen ? "1" : "0"}`}
                      useMap={useMap}
                    />
                    <TileLayer
                      attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    />
                    <Circle
                      center={userPosition}
                      radius={60}
                      pathOptions={{
                        color: "#34d399",
                        fillColor: "#34d399",
                        fillOpacity: 0.25,
                        weight: 2,
                      }}
                    />

                    {marketMode === "investments" &&
                      cadastrePermitsForMap.map((permit) => {
                        const rawStatus = normalizeCadastreStatus(
                          (permit as any).cadastreStatus ||
                            (permit.permitStatus === "active"
                              ? "VERIFIED"
                              : permit.permitStatus === "suspended"
                                ? "INACTIVE"
                                : "PENDING"),
                        );
                        const statusColor = getCadastreStatusColor(rawStatus);
                        const typeColor = getCadastreTypeColor((permit as any).siteType || permit.permitType);
                        const riskColor = getCadastreRiskColor((permit as any).riskLevel || "MEDIUM");
                        const cadastreName = String(permit.holderName || "").trim() || "MISSING CADASTRE NAME - FIX";
                        const center = [permit.centroid.lat, permit.centroid.lng] as [number, number];
                        return (
                          <Fragment key={`cadastre-${permit.permitId}`}>
                            <Circle
                              center={center}
                              radius={4200}
                              pathOptions={{
                                color: riskColor,
                                weight: 0,
                                opacity: 1,
                                fillColor: riskColor,
                                fillOpacity: 0.3,
                              }}
                            />
                            <Circle
                              center={center}
                              radius={2200}
                              pathOptions={{
                                color: typeColor,
                                weight: 2,
                                opacity: 1,
                                fillColor: statusColor,
                                fillOpacity: 1,
                              }}
                            >
                              <Popup>
                                <div className="min-w-[250px] bg-gray-900 text-white p-3 rounded-lg -m-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <strong className="text-sm text-white">{cadastreName}</strong>
                                    <Badge className="text-[9px] border-white/20" style={{ backgroundColor: statusColor, color: "#0b1020" }}>
                                      {rawStatus}
                                    </Badge>
                                  </div>
                                  <div className="text-[11px] text-white/70 space-y-1">
                                    <div>{t("cadastre.permitId")}: {permit.permitId || "-"}</div>
                                    <div>{t("cadastre.permitType")}: {permit.permitType || "-"}</div>
                                    <div>{t("cadastre.permitStatus")}: {rawStatus}</div>
                                    <div>{t("cadastre.region")}: {permit.region || "-"}</div>
                                  </div>
                                  {permit.sourceUrl ? (
                                    <a
                                      href={permit.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-2 inline-flex text-[11px] text-emerald-300 hover:text-emerald-200"
                                    >
                                      {t("cadastre.sourceLink")}
                                    </a>
                                  ) : null}
                                </div>
                              </Popup>
                            </Circle>
                            <Polygon
                              positions={permit.geometry as any}
                              pathOptions={{ color: statusColor, weight: 1, opacity: 1, fillColor: statusColor, fillOpacity: 0.1 }}
                            />
                          </Fragment>
                        );
                      })}
                    {mapFitPoints ? <MapFitBounds points={mapFitPoints} paddingPx={56} useMap={useMap} L={L} /> : null}
        {hoveredShopPoint ? (
          <Circle
            center={hoveredShopPoint}
            radius={320}
            pathOptions={{
              color: "#F59E0B",
              fillColor: "#F59E0B",
              fillOpacity: 0.18,
              weight: 3,
              className: "map-pulse-circle",
            }}
          />
        ) : null}

        {(marketMode === "dore" || marketMode === "marketplace") && mapShops.map((shop: any) => {
          if (!shop.latitude || !shop.longitude) return null;
          const rawLat = parseFloat(shop.latitude);
          const rawLng = parseFloat(shop.longitude);
          if (isNaN(rawLat) || isNaN(rawLng)) return null;

          const displayLatLng = isWholesalePreview
            ? obfuscateLatLng(rawLat, rawLng, `shop:${shop.id}`)
            : { lat: rawLat, lng: rawLng };

          const lat = displayLatLng.lat;
          const lng = displayLatLng.lng;
          
          const totalStock = shop.products?.reduce((sum: number, p: any) => sum + (p.stockQuantity || 0), 0) || 0;
          const shopCategory = getShopPrimaryCategory(shop);
          const shopCategoryMeta = getCategoryMeta(shopCategory);
          const isJewelerShop =
            shop?.sellerType === "jeweler" || shop?.productionType === "jewelry_manufacturing";
          const shopLocationLabel =
            [shop?.cityName, shop?.countryName].filter(Boolean).join(", ") ||
            shop.streetAddress ||
            shop.distanceText ||
            "Regional listing";
          const approxDistanceText = formatApproxDistance(shop.distance);
          const shopDistanceLabel = shop.distanceText || approxDistanceText || null;
          const waDigits = typeof shop?.phoneNumber === "string" ? shop.phoneNumber.replace(/\D/g, "") : "";
          const waHref =
            !isWholesalePreview && whatsappEnabled && isJewelerShop && waDigits
              ? `https://wa.me/${waDigits}?text=${encodeURIComponent(
                  `Hello ${shop.shopName}, I'm interested in your catalog on ${tenant.name}.`,
                )}`
              : null;
          
          return (
            <Marker
              key={shop.id}
              position={[lat, lng]}
              icon={
                isGoldTenant
                  ? createGoldShopIcon(L, shop.products, {
                      productionType: shop.productionType,
                      mineType: shop.mineType,
                      availableThisWeekKg: shop.availableThisWeekKg,
                      estWeeklyOutputKg: shop.estWeeklyOutputKg,
                      estWeeklyOutputRangeMinKg: shop.estWeeklyOutputRangeMinKg,
                      estWeeklyOutputRangeMaxKg: shop.estWeeklyOutputRangeMaxKg,
                      estWeeklyOutputConfidence: shop.estWeeklyOutputConfidence,
                    })
                  : createShopIcon(L, shopCategory, shop.productionType, shop.mapMarkerStyle)
              }
              eventHandlers={{
                click: () => {
                  if (isWholesalePreview) {
                    setWholesaleApplyOpen(true);
                    return;
                  }
                  if (buyerMode === "retail" && isDesktopRetail && showProducts) {
                    const preferred = selectedCategory || activeRailSlug;
                    if (scrollToShopInRails(shop.id, preferred)) return;
                  }
                  setSelectedShop(shop);
                }
              }}
            >
              <Popup>
                <div className="min-w-[220px] bg-gray-900 text-white p-3 rounded-lg -m-3">
                  <div className="flex items-center gap-2 mb-2">
                    <img src={shopCategoryMeta.image} className="w-10 h-10 rounded-lg object-cover" alt={shopCategoryMeta.label} />
                    <div className="min-w-0 flex-1">
                      <strong className="text-sm text-white block truncate">{shop.shopName}</strong>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[10px] text-emerald-400">{getShopTypeLabel(shop)}</span>
                        <Badge
                          className={`text-[9px] px-2 py-0.5 ${
                            shop.verifiedAt
                              ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30"
                              : "bg-white/5 text-white/70 border-white/10"
                          }`}
                        >
                          {shop.verifiedAt ? "Verified" : "Unverified"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-2 pb-2 border-b border-gray-700">
                    <span className="text-gray-400 truncate">{shopLocationLabel}</span>
                    <span
                      className={`font-bold ${
                        isWholesalePreview ? "text-amber-300" : isJewelerShop ? "text-emerald-300" : totalStock > 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {isWholesalePreview
                        ? "Controlled preview"
                        : isJewelerShop
                          ? shopDistanceLabel
                            ? `${shopDistanceLabel} away`
                            : "Distance unknown"
                          : (approxDistanceText || (totalStock > 0 ? getShopStockLabel(shop) : "Sold out"))}
                    </span>
                  </div>
                  {!isWholesalePreview && isGoldTenant && shopCategory === "dore" &&
                    (() => {
                      const mineType = normalizeMineType(shop?.mineType);
                      const estKg =
                        parseMaybeNumber(shop?.estWeeklyOutputKg) ??
                        parseMaybeNumber(shop?.avgWeeklyOutputKg) ??
                        parseMaybeNumber(shop?.availableThisWeekKg) ??
                        null;

                      const rangeMinRaw =
                        parseMaybeNumber(shop?.estWeeklyOutputRangeMinKg) ??
                        (estKg != null ? estKg * 0.6 : mineType === "industrial" ? 2.0 : 1.0);
                      const rangeMaxRaw =
                        parseMaybeNumber(shop?.estWeeklyOutputRangeMaxKg) ??
                        (estKg != null ? estKg * 1.2 : mineType === "industrial" ? 5.0 : 2.0);
                      const rangeMinKg = Math.min(rangeMinRaw, rangeMaxRaw);
                      const rangeMaxKg = Math.max(rangeMinRaw, rangeMaxRaw);

                      const confidenceRaw = String(shop?.estWeeklyOutputConfidence || "").trim().toLowerCase();
                      const confidence =
                        confidenceRaw === "low" || confidenceRaw === "med" || confidenceRaw === "high" ? confidenceRaw : null;

                      const updatedRaw = shop?.estWeeklyOutputUpdatedAt || shop?.mineLastUpdatedAt || null;
                      const updatedAt = (() => {
                        if (!updatedRaw) return null;
                        const d = new Date(updatedRaw);
                        if (Number.isNaN(d.getTime())) return null;
                        return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
                      })();

                      return (
                        <div className="text-[10px] text-gray-400 -mt-1 mb-2 space-y-0.5">
                          <div>
                            Est. weekly output: {formatKgRangeAsHuman(rangeMinKg, rangeMaxKg)}/wk
                            {confidence ? ` (${confidence})` : ""}
                          </div>
                          {updatedAt ? <div>Last updated: {updatedAt}</div> : null}
                        </div>
                      );
                    })()}
                  {shop.products?.slice(0, 2).map((product: any) => {
                    const category = getCategory(product);
                    const meta = getCategoryMeta(category);
                    const badgeLabel = isGoldTenant
                      ? category === "dore"
                        ? "DORÉ"
                        : category === "stamped"
                          ? "STAMPED"
                          : category === "gold-art"
                            ? "GOLD ART"
                            : category === "jewelry"
                              ? "JEWELRY"
                              : "GOLD"
                      : meta.label.toUpperCase();
                    const badgeClass = isGoldTenant
                      ? category === "dore"
                        ? "bg-orange-500/20 text-orange-400"
                        : category === "stamped"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : category === "gold-art"
                            ? "bg-yellow-500/20 text-yellow-300"
                            : category === "jewelry"
                              ? "bg-violet-500/20 text-violet-200"
                              : "bg-white/10 text-white/70"
                      : "bg-white/10 text-white/70";
                    return (
                      <div key={product.id} className="flex justify-between items-center py-1.5 border-b border-gray-800 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[8px] px-1 py-0.5 rounded ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                          <span className="text-xs text-white">{product.name?.slice(0, 18)}</span>
                        </div>
                        <span className="text-xs font-bold text-amber-400">
                          {getProductPriceDisplay(product).primary}
                        </span>
                      </div>
                    );
                  })}
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      className={`${
                        waHref ? "flex-1" : "w-full"
                      } bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold`}
                      onClick={() => {
                        if (isWholesalePreview) {
                          setWholesaleApplyOpen(true);
                          return;
                        }
                        setSelectedShop(shop);
                      }}
                    >
                      {isWholesalePreview ? t("wholesale.apply.accessButton") : t("common.viewCatalog")}
                    </Button>
                    {waHref ? (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="flex-1 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10"
                      >
                        <a href={waHref} target="_blank" rel="noopener noreferrer">
                          {t("common.contactWhatsapp")}
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {marketMode === "machinery" &&
          visibleMachinery.map((item) => (
            <Marker
              key={item.id}
              position={[item.location.lat, item.location.lng]}
              icon={createMachineryIcon(L, item)}
              eventHandlers={{
                click: () => {
                  setSelectedMachinery(item);
                },
              }}
            >
              <Popup>
                <div className="min-w-[220px] bg-gray-900 text-white p-3 rounded-lg -m-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <strong className="text-sm text-white block truncate">{item.name}</strong>
                      <span className="text-[10px] text-white/60">
                        {formatMachineryCategory(item.category, t)} • {formatMachineryCondition(item.condition, t)}
                      </span>
                    </div>
                    <Badge className="text-[10px] bg-blue-500/15 text-blue-200 border-blue-400/30">
                      {formatMachineryStatus(item.status, t)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                    <span>
                      {item.location.country} • {item.location.region}
                    </span>
                    <span className="font-semibold text-amber-400">
                      {item.price
                        ? formatMoney(item.price.amount, item.price.currency)
                        : item.financingAvailable
                          ? t("machinery.financingAvailable")
                          : "—"}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full mt-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-black font-semibold"
                    onClick={() => setSelectedMachinery(item)}
                  >
                    {t("common.viewDetails")}
                  </Button>
                </div>
              </Popup>
            </Marker>
          ))}

        {marketMode === "investments" &&
          visibleOpportunities.map((op) => (
            <Marker
              key={op.id}
              position={[op.location.lat, op.location.lng]}
              icon={createOpportunityIcon(L, op)}
              eventHandlers={{
                click: () => {
                  setSelectedOpportunity(op);
                },
              }}
            >
              <Popup>
                <div className="min-w-[240px] bg-gray-900 text-white p-3 rounded-lg -m-3">
                  {(() => {
	                      const mine = getMineById(op.mineId);
	                      const cadastrePermit = getCadastrePermitForMine(mine);
	                      const cadastreOk = isCadastrePermitValid(cadastrePermit);
	                      const cadastreSource = mine ? getCadastreSourceForCountry(mine.country) : null;
                      const regionLabel = mine
                        ? `${mine.country} • ${mine.region}`
                        : `${op.location.country} • ${op.location.region}`;
                    return (
                      <>
                        <div className="min-w-0">
                          <strong className="text-sm text-white block truncate">{op.title}</strong>
                          <div className="text-[10px] text-emerald-300">{t("cadastre.badgeVerified")}</div>
                          <div className="text-[10px] text-white/55 truncate">{regionLabel}</div>
                          {cadastreOk ? (
                            <div className="mt-1 text-[10px] text-white/60">
                              {t("cadastre.permitId")}: {cadastrePermit?.permitId}
                            </div>
                          ) : null}
                          {cadastreOk && cadastreSource?.sourceUrl ? (
                            <a
                              href={cadastreSource.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-emerald-300 hover:text-emerald-200"
                            >
                              {t("cadastre.sourceLink")}
                            </a>
                          ) : null}
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
                          <div>
                            <div className="text-white/45">Active since</div>
                            <div className="font-semibold text-white">{mine?.licenseActiveSinceYear ?? "—"}</div>
                          </div>
                          <div>
                            <div className="text-white/45">Capacity</div>
                            <div className="font-semibold text-white">
                              {mine ? `${mine.currentCapacityKgPerMonth} kg/mo` : "—"}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-white/45">Production (12m)</div>
                            <div className="font-semibold text-white">
                              {mine ? `${mine.historicalProductionLast12MonthsKg} kg` : "—"}
                            </div>
                          </div>
                        <div className="col-span-2">
                            <div className="text-white/45">{t("investments.field.remainingPotential")}</div>
                            <div className="font-semibold text-white">
                              {mine?.remainingPotential ? t(`investments.potential.${mine.remainingPotential}`) : "—"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-white/70">{t("investments.field.capitalRequired")}</span>
                          <span className="font-semibold text-amber-400">
                            {formatMoney(op.capitalRequired.amount, op.capitalRequired.currency)}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                  <Button
                    size="sm"
                    className="w-full mt-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-semibold"
                    onClick={() => setSelectedOpportunity(op)}
                  >
                    {t("investments.actions.viewOpportunity")}
                  </Button>
                </div>
              </Popup>
            </Marker>
          ))}
                  </MapContainer>
                );
              })()
            )}
          </div>
        </div>
      )}

      {showFeedView && (
        <div className="absolute inset-0 z-0 bg-black">
          <div className="h-full w-full overflow-y-auto snap-y snap-mandatory scroll-smooth" onScroll={handleFeedScroll}>
            {reelsItems.length ? (
              reelsItems.map((product: any) => {
                const badge = getCategoryBadge(product);
                const price = getProductPriceDisplay(product);
                const videoUrl = getProductVideoUrl(product);
                const imageUrl = getProductImages(product)[0];
                const isAvailable = (product?.stockQuantity ?? 0) > 0 || product?.inStock;

                return (
                  <div key={product.id} className="relative h-[100dvh] w-full snap-start">
                    <ReelsMedia videoUrl={videoUrl} imageUrl={imageUrl} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/60" />

                    <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-[calc(var(--bottom-stack-height)+18px)] pt-6">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                          {badge.label}
                        </Badge>
                        <span className="text-[11px] text-white/70 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {formatDistanceAway(getProductDistanceKm(product)) ?? t("location.setToSeeDistance")}
                        </span>
                      </div>

                      <h2 className="mt-2 text-xl font-semibold leading-snug text-white">{product.name}</h2>
                      {product?.shopName ? (
                        <p className="mt-1 text-[12px] text-white/70 truncate">{product.shopName}</p>
                      ) : null}

                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-amber-300">{price.primary}</div>
                          {price.secondary ? <div className="text-[11px] text-white/60">{price.secondary}</div> : null}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="border-white/15 text-white/90 hover:bg-white/10"
                            onClick={() => setSelectedProduct(product)}
                          >
                            {t("common.view")}
                          </Button>
                          <Button
                            type="button"
                            className={`${
                              isAvailable
                                ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black"
                                : "bg-white/10 text-white/40 cursor-not-allowed"
                            } font-semibold`}
                            disabled={!isAvailable}
                            onClick={() => addToCart(product, null)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            {t("button.add")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex items-center justify-center text-white/70">
                <div className="text-center">
                  <p className="text-sm font-semibold">{noProductsTitle}</p>
                  <p className="text-xs text-white/50 mt-1">
                    {t(isGoldTenant ? "buyer.feed.expandingGold" : "buyer.feed.expandingGeneral")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isWholesalePreview && (
        <div className="absolute inset-0 z-[45] pointer-events-none">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
          <div className="absolute top-[calc(env(safe-area-inset-top,0px)+132px)] md:top-[calc(env(safe-area-inset-top,0px)+132px)] lg:top-[calc(env(safe-area-inset-top,0px)+116px)] left-0 right-0 flex justify-center px-4 pointer-events-auto">
            <div className="w-full max-w-lg rounded-2xl border border-orange-500/20 bg-black/70 backdrop-blur-xl p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-300">{t("wholesale.preview.title")}</p>
                  <p className="text-white text-lg font-semibold mt-1">{t("wholesale.preview.accessRequired")}</p>
                  <p className="text-white/60 text-sm mt-1">
                    {t("wholesale.preview.hiddenUntilApproval")}
                  </p>
                </div>
                {isWholesaleAccessPending && (
                  <Badge className="bg-orange-500/15 text-orange-200 border-orange-400/30 text-[10px]">
                    {t("wholesale.preview.requestPending")}
                  </Badge>
                )}
              </div>

              <div className="mt-4 grid gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-white/80 text-sm font-medium">Wholesale access includes</p>
                  <ul className="mt-2 text-[12px] text-white/60 space-y-1">
                    <li>{isGoldTenant ? "Dore trading interface" : "Wholesale trading interface"}</li>
                    <li>Counterparty checks & compliance requirements</li>
                    <li>Chain-of-custody documentation (when available)</li>
                  </ul>
                </div>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <Button
                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-semibold"
                  onClick={() => setWholesaleApplyOpen(true)}
                >
                  {t("wholesale.apply.cta")}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
                  onClick={setRetailMode}
                >
                  {t("wholesale.apply.continueRetail")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="absolute top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10 safe-area-top">
        <div className="w-full px-4 md:px-6 lg:px-8 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLockup subtitle={isMobile ? undefined : t("header.subtitle")} />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="min-h-[44px] min-w-[44px] md:h-9 md:w-9 text-gray-200 hover:text-white hover:bg-white/10 relative"
              onClick={() => setCartOpen(true)}
              aria-label={t("cart.title")}
            >
              <ShoppingCart className="h-5 w-5 md:h-4 md:w-4" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                  {cart.length}
                </span>
              )}
            </Button>

            <Button
              variant="ghost"
              className="min-h-[44px] min-w-[44px] md:h-9 md:w-9 text-gray-200 hover:text-white hover:bg-white/10"
              onClick={() => navigate("/orders")}
              aria-label="Orders"
            >
              <Package className="h-5 w-5 md:h-4 md:w-4" />
            </Button>

            <Button
              variant="ghost"
              className="min-h-[44px] min-w-[44px] md:h-9 md:w-9 text-gray-200 hover:text-white hover:bg-white/10"
              onClick={() => {
                if (!isAuthedUser) {
                  navigate("/login");
                  return;
                }
                navigate("/contracts");
              }}
              aria-label="Contracts"
            >
              <ClipboardList className="h-5 w-5 md:h-4 md:w-4" />
            </Button>

            <Button
              variant="ghost"
              className="hidden md:inline-flex min-h-[44px] min-w-[44px] md:h-9 md:px-3 text-gray-200 hover:text-white hover:bg-white/10"
              onClick={() => {
                setVaultPane("wallet");
                setVaultOpen(true);
              }}
              aria-label={t("wallet.title")}
            >
              <Wallet className="h-5 w-5 md:h-4 md:w-4 md:mr-2" />
              <span className="hidden md:inline text-[11px] font-semibold text-amber-200">
                {walletBalanceLabel || t("wallet.title")}
              </span>
            </Button>

            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="min-h-[44px] min-w-[44px] text-gray-200 hover:text-white hover:bg-white/10"
                    aria-label="Profile"
                  >
                    <UserCircle className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-gray-900 border-gray-700 text-white">
                  {accountMenu}
                  {signOutMenuItem}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="hidden md:flex items-center gap-2">
                <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 px-3 rounded-full text-[11px] ${
                      buyerMode === "retail"
                        ? "bg-amber-500/20 text-amber-300"
                        : "text-white/70 hover:text-white"
                    }`}
                    onClick={setRetailMode}
                  >
                    {retailModeLabel}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 px-3 rounded-full text-[11px] ${
                      buyerMode === "wholesale"
                        ? "bg-orange-500/20 text-orange-200"
                        : "text-white/70 hover:text-white"
                    }`}
                    onClick={() => setWholesaleMode("dore")}
                  >
                    {t("mode.wholesale")}
                  </Button>
                </div>



                {buyerMode === "wholesale" && isGoldTenant && (
                  <>
                <Button
                  variant="ghost"
                  className={`h-9 px-3 text-gray-200 hover:text-white hover:bg-white/10 ${
                    buyerMode === "wholesale" && marketMode === "machinery"
                      ? "bg-sky-500/15 text-sky-200 hover:bg-sky-500/20"
                      : ""
                  }`}
                  disabled={!isWholesaleAuthorized}
                  title={
                    isWholesaleAuthorized
                      ? t("nav.machinery")
                      : `${t("nav.machinery")} — Requires approved wholesale access`
                  }
                  onClick={() => setWholesaleMode("machinery")}
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  <span className="max-w-[140px] truncate text-[12px]">{t("nav.machinery")}</span>
                </Button>

                <Button
                  variant="ghost"
                  className={`h-9 px-3 text-gray-200 hover:text-white hover:bg-white/10 ${
                    marketMode === "investments" ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20" : ""
                  }`}
                  title={t("nav.investments")}
                  onClick={setInvestMode}
                >
                  <BriefcaseBusiness className="h-4 w-4 mr-2" />
                  <span className="max-w-[170px] truncate text-[12px]">{t("nav.investments")}</span>
                </Button>
                  </>
                )}

                <Button
                  variant="ghost"
                  className="h-9 px-3 text-gray-200 hover:text-white hover:bg-white/10"
                  onClick={() => navigate("/app")}
                  aria-label={t("pro.space")}
                >
                  <Bot className="h-4 w-4 mr-2" />
                  <span className="text-[12px] font-semibold">{t("pro.space")}</span>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="h-9 px-3 text-gray-200 hover:text-white hover:bg-white/10"
                    aria-label={t("common.settings")}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    <span className="hidden lg:inline">{t("common.settings")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 bg-gray-900 border-gray-700 text-white">
                  <DropdownMenuLabel className="text-xs text-gray-400">{t("location.radius.title")}</DropdownMenuLabel>
                  <DropdownMenuItem
                    className="flex flex-col items-start gap-2 cursor-default focus:bg-transparent"
                    onSelect={(event) => event.preventDefault()}
                  >
                    <div className="w-full space-y-2">
                      <Slider
                        value={[radiusKm]}
                        min={5}
                        max={20000}
                        step={25}
                        onValueChange={(value) => {
                          const next = Array.isArray(value) ? value[0] : radiusKm;
                          if (!Number.isFinite(next)) return;
                          setRadiusCustomized(true);
                          setRadiusKm(next);
                        }}
                      />
                      <div className="flex items-center justify-between text-[10px] text-white/50">
                        <span>5 {t("units.km")}</span>
                        <span className="text-white/80">
                          {radiusKm} {t("units.km")}
                        </span>
                        <span>20000 {t("units.km")}</span>
                      </div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuLabel className="text-xs text-gray-400">{t("settings.language")}</DropdownMenuLabel>
                  {(Object.keys(languageNames) as Language[]).map((lang) => (
                    <DropdownMenuItem
                      key={lang}
                      className={`cursor-pointer hover:bg-gray-800 ${language === lang ? "bg-amber-500/10 text-amber-300" : ""}`}
                      onClick={() => setLanguage(lang)}
                    >
                      {languageNames[lang]}
                    </DropdownMenuItem>
                  ))}

                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuLabel className="text-xs text-gray-400">{t("settings.currency")}</DropdownMenuLabel>
                  {(Object.keys(currencyNames) as Currency[]).map((curr) => (
                    <DropdownMenuItem
                      key={curr}
                      className={`cursor-pointer hover:bg-gray-800 ${currency === curr ? "bg-amber-500/10 text-amber-300" : ""}`}
                      onClick={() => setCurrency(curr)}
                    >
                      {currencyNames[curr]}
                    </DropdownMenuItem>
                  ))}

                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuItem className="cursor-pointer hover:bg-gray-800" onClick={() => navigate("/terms")}>
                    {t("common.terms")}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer hover:bg-gray-800" onClick={() => navigate("/privacy")}>
                    {t("common.privacy")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-gray-800"
                    onClick={() => navigate("/cadre-conformite")}
                  >
                    {t("common.compliance")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-9 px-3 text-gray-200 hover:text-white hover:bg-white/10"
                    aria-label={t("nav.account")}
                  >
                    <UserCircle className="h-4 w-4 mr-2" />
                    <span className="hidden lg:inline">{t("nav.account")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-gray-900 border-gray-700 text-white">
                  {accountMenu}
                  {signOutMenuItem}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="min-h-[44px] min-w-[44px] text-gray-200 hover:text-white hover:bg-white/10"
                    aria-label={t("common.menu")}
                  >
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 bg-gray-900 border-gray-700 text-white">
                  <DropdownMenuItem className="cursor-pointer hover:bg-gray-800" onClick={() => navigate("/app")}>
                    <Bot className="h-4 w-4 mr-2" />
                    {t("pro.space")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-gray-700" />

                  <DropdownMenuLabel className="text-xs text-gray-400">{t("location.radius.title")}</DropdownMenuLabel>
                  <DropdownMenuItem
                    className="flex flex-col items-start gap-2 cursor-default focus:bg-transparent"
                    onSelect={(event) => event.preventDefault()}
                  >
                    <div className="w-full space-y-2">
                      <Slider
                        value={[radiusKm]}
                        min={5}
                        max={20000}
                        step={25}
                        onValueChange={(value) => {
                          const next = Array.isArray(value) ? value[0] : radiusKm;
                          if (!Number.isFinite(next)) return;
                          setRadiusCustomized(true);
                          setRadiusKm(next);
                        }}
                      />
                      <div className="flex items-center justify-between text-[10px] text-white/50">
                        <span>5 {t("units.km")}</span>
                        <span className="text-white/80">
                          {radiusKm} {t("units.km")}
                        </span>
                        <span>20000 {t("units.km")}</span>
                      </div>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuLabel className="text-xs text-gray-400">{t("settings.language")}</DropdownMenuLabel>
                  {(Object.keys(languageNames) as Language[]).map((lang) => (
                    <DropdownMenuItem
                      key={lang}
                      className={`cursor-pointer hover:bg-gray-800 ${language === lang ? "bg-amber-500/10 text-amber-300" : ""}`}
                      onClick={() => setLanguage(lang)}
                    >
                      {languageNames[lang]}
                    </DropdownMenuItem>
                  ))}

                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuLabel className="text-xs text-gray-400">{t("settings.currency")}</DropdownMenuLabel>
                  {(Object.keys(currencyNames) as Currency[]).map((curr) => (
                    <DropdownMenuItem
                      key={curr}
                      className={`cursor-pointer hover:bg-gray-800 ${currency === curr ? "bg-amber-500/10 text-amber-300" : ""}`}
                      onClick={() => setCurrency(curr)}
                    >
                      {currencyNames[curr]}
                    </DropdownMenuItem>
                  ))}

                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuItem className="cursor-pointer hover:bg-gray-800" onClick={() => navigate("/terms")}>
                    {t("common.terms")}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer hover:bg-gray-800" onClick={() => navigate("/privacy")}>
                    {t("common.privacy")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer hover:bg-gray-800"
                    onClick={() => navigate("/cadre-conformite")}
                  >
                    {t("common.compliance")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {tickerItems && (
          <div className="bg-gradient-to-r from-black/90 via-black/80 to-black/90 backdrop-blur-sm border-t border-white/10 overflow-x-auto scrollbar-hide">
            <div className="w-full px-4 md:px-6 lg:px-8">
              <div className="min-w-full flex justify-center py-1.5">
                <div className="flex items-center gap-4 min-w-max">{tickerItems}</div>
              </div>
            </div>
          </div>
        )}
      </header>

      {!isMobile ? (
        <div className="hidden md:block fixed bottom-4 left-4 z-[55] rounded-2xl border border-white/10 bg-black/55 backdrop-blur-xl p-3 shadow-2xl">
          <div className="text-xs font-semibold text-white">{t("pro.app.title")}</div>
          <div className="mt-2 flex items-center gap-3">
            <img src="/qr-app.svg" alt={t("pro.app.qrAlt")} className="h-20 w-20 rounded-lg bg-white p-1" />
            <div className="min-w-0">
              <div className="text-[11px] text-white/70">{t("pro.app.scanToOpen")}</div>
              <button
                type="button"
                className="mt-1 text-[12px] font-semibold text-amber-300 hover:text-amber-200"
                onClick={() => navigate("/app")}
              >
                /app
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!isMobile && showProducts && (marketMode === "marketplace" || (!isWholesalePreview && marketMode === "dore")) && (
        <div
          className={`absolute bottom-0 left-0 right-0 md:top-[calc(env(safe-area-inset-top,0px)+132px)] lg:top-[calc(env(safe-area-inset-top,0px)+116px)] z-40 w-full bg-gradient-to-t from-black/95 via-black/80 to-transparent md:backdrop-blur-xl md:rounded-2xl md:border safe-area-bottom ${
            buyerMode === "wholesale"
              ? "md:bg-black/75 md:border-orange-500/20"
              : "md:bg-black/55 md:border-white/10"
          } ${
            isDesktopRetail
              ? `${mapOverlayOpen ? "md:left-[384px]" : "md:left-3"} md:right-3 md:bottom-3 md:flex md:flex-col`
              : "md:bottom-auto md:right-3 md:left-auto md:w-[340px]"
          }`}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-1 h-8 bg-amber-500 rounded-full hidden md:block" />
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {buyerMode === "wholesale"
                    ? (isWholesalePreview
                      ? t("wholesale.preview.title")
                      : isGoldTenant
                        ? t("buyer.panel.wholesaleDore.title")
                        : t("buyer.panel.wholesaleMarketplace.title"))
                    : retailPanelTitle}
                 </h3>
                 <p className="text-[10px] text-white/50">
                   {buyerMode === "wholesale"
                     ? (isWholesalePreview
                       ? t("wholesale.preview.subtitle")
                       : isGoldTenant
                        ? t("sections.doreLots.subtitle")
                        : t("buyer.panel.wholesaleMarketplace.subtitle"))
                     : retailPanelSubtitle}
                 </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {buyerMode === "retail" && categories.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-[11px] text-white/70 hover:text-white hover:bg-white/10 rounded-full"
                  onClick={() => setCategoriesSheetOpen(true)}
                >
                  <Package className="h-4 w-4 mr-2" />
                  {t("common.categories")}
                </Button>
              ) : null}
              {!isDesktopRetail && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 rounded-full"
                  onClick={() => setShowProducts(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {buyerMode === "retail" && categories.length > 0 ? (
            <div className="px-4 pb-2">
              <div className="relative">
              <div
                ref={categoryChipsRef}
                className={`flex items-center gap-2 overflow-x-auto scrollbar-hide scroll-smooth ${
                  categoryChipsUi.overflow ? "pr-20" : "pr-2"
                }`}
                style={{ paddingBottom: "2px" }}
              >
                <button
                  type="button"
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs border transition-colors whitespace-nowrap ${
                    !selectedCategory
                      ? "bg-amber-500/25 border-amber-500/40 text-amber-200"
                      : "bg-black/30 border-white/10 text-white/70 hover:text-white hover:border-white/20"
                  }`}
                  onClick={() => setSelectedCategory(null)}
                >
                  <span className="drop-shadow-md">{t("common.all")}</span>
                </button>
                {categories.map((cat: any) => (
                  <button
                    key={`chip-${cat.id}`}
                    type="button"
                    data-category-slug={cat.slug}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs border transition-colors whitespace-nowrap ${
                      selectedCategory === cat.slug
                        ? "bg-amber-500/25 border-amber-500/40 text-amber-200"
                        : "bg-black/30 border-white/10 text-white/70 hover:text-white hover:border-white/20"
                    }`}
                    onClick={() => setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug)}
                    title={cat.name}
                  >
                    <span className="drop-shadow-md">{cat.icon || categoryIcons[cat.slug] || "•"}</span>
                    <span className="max-w-[170px] truncate">{getCategoryChipLabel(cat.name)}</span>
                  </button>
                ))}
              </div>

              {categoryChipsUi.overflow && !categoryChipsUi.atStart ? (
                <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/70 to-transparent" />
              ) : null}
              {categoryChipsUi.overflow && !categoryChipsUi.atEnd ? (
                <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-black/70 to-transparent" />
              ) : null}

              {categoryChipsUi.overflow && !categoryChipsUi.atStart ? (
                <button
                  type="button"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/55 border border-white/10 text-white/80 hover:text-white hover:bg-black/75 backdrop-blur flex items-center justify-center"
                  onClick={() => scrollCategoryChipsBy(-1)}
                  aria-label={t("buyer.categories.scrollLeft")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : null}
              {categoryChipsUi.overflow && !categoryChipsUi.atEnd ? (
                <button
                  type="button"
                  className="absolute right-10 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/55 border border-white/10 text-white/80 hover:text-white hover:bg-black/75 backdrop-blur flex items-center justify-center"
                  onClick={() => scrollCategoryChipsBy(1)}
                  aria-label={t("buyer.categories.scrollRight")}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}

              {categoryChipsUi.overflow ? (
                <button
                  type="button"
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-9 rounded-full bg-black/55 border border-white/10 text-white/80 hover:text-white hover:bg-black/75 backdrop-blur flex items-center justify-center"
                  onClick={() => setCategoriesSheetOpen(true)}
                  aria-label={t("common.allCategories")}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              ) : null}
              </div>
              {nearbyFallbackUsed ? (
                <div className="mt-1 text-[10px] text-amber-200/70">
                  {t("buyer.categories.showingClosestItems")
                    .replace("{radiusKm}", String(radiusKm))
                    .replace("{unit}", t("units.km"))}
                </div>
              ) : categoryChipsUi.overflow ? (
                <div className="mt-1 text-[10px] text-white/45">{t("buyer.categories.scrollForMore")}</div>
              ) : null}
              {showFallbackProducts ? (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                  <span className="min-w-0 truncate">{t("buyer.categories.noItemsFallback")}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 border-amber-500/30 text-amber-100 hover:bg-amber-500/10"
                    onClick={() => setSelectedCategory(null)}
                  >
                    Show all
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {feedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            </div>
          ) : (
            <>
              <div className="md:hidden overflow-x-auto pb-[calc(var(--bottom-stack-height)+16px)] px-3 scrollbar-hide">
                <div className="flex gap-3" style={{ width: 'max-content' }}>
                  {panelPreviewTrimmed.map((product: any) => {
                    const badge = getCategoryBadge(product);
                    const isAdminUser = session.user?.currentMode === "admin" || session.hasRole?.("admin" as any);
                    const hasRealImages = collectProductImages(product).length > 0;
                    return (
                      <div
                        key={product.id}
                        className="w-36 flex-shrink-0 rounded-xl overflow-hidden cursor-pointer group shadow-lg active:scale-[0.98]"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <div className="aspect-square overflow-hidden relative">
                          <img
                            src={getCommodityImage(product)}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = buildProductPlaceholder(product, 0);
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                          <div className="absolute top-1.5 left-1.5 flex gap-1">
                            <Badge className={`text-[7px] px-1 py-0 ${badge.className}`}>
                              {badge.label}
                            </Badge>
                            {isAdminUser && !hasRealImages ? (
                              <button
                                type="button"
                                className="h-5 w-5 rounded-full bg-black/55 border border-amber-500/30 text-amber-200 hover:bg-black/75 flex items-center justify-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/admin/marketplace/products?images=${encodeURIComponent(String(product.id))}`);
                                }}
                                title="Edit product images"
                                aria-label="Edit product images"
                              >
                                <Wrench className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                          <div className="absolute top-1.5 right-1.5">
                            <Badge className={`text-[6px] px-1 py-0 animate-pulse ${
                              (product.stockQuantity || 0) > 0
                                ? 'bg-emerald-500/90 text-white border-emerald-400/50'
                                : 'bg-rose-500/90 text-white border-rose-400/50'
                            }`}>
                              {getProductStockLabel(product).text}
                            </Badge>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 p-2">
                            <p className="text-xs font-medium text-white truncate drop-shadow-lg">{product.name}</p>
                            <p className="text-[9px] text-white/50 flex items-center gap-1 truncate drop-shadow-md">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span className="flex-shrink-0">
                                {formatDistanceAway(getProductDistanceKm(product)) ?? t("location.setToSeeDistance")}
                              </span>
                              <span className="text-white/35 flex-shrink-0">•</span>
                              <span className="truncate text-white/60">{product.shopName}</span>
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-amber-400 font-bold text-[11px] drop-shadow-lg">
                                {getProductPriceDisplay(product).primary}
                              </p>
                              <Button
                                size="icon"
                                className={`h-6 w-6 rounded-full ${(product.stockQuantity || 0) > 0 ? 'bg-amber-500/90 hover:bg-amber-500 text-black' : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'}`}
                                disabled={(product.stockQuantity || 0) <= 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if ((product.stockQuantity || 0) > 0) addToCart(product, null);
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div
                className={`hidden md:block ${
                  isDesktopRetail ? "flex-1 overflow-y-auto px-4 pb-4" : "h-[65vh] overflow-y-auto px-3 pb-4"
                }`}
              >
                {isDesktopRetail ? (
                  (() => {
                      const total = panelSections.reduce((sum, section) => {
                        const items = retailDisplayByCategoryResolved[section.slug] || [];
                        return sum + items.length;
                      }, 0);

                    if (productsLoading && total === 0) {
                      const placeholders = Array.from({ length: 6 }, (_, idx) => idx);
                      return (
                        <div className="space-y-4">
                          {panelSections.map((section) => {
                            const meta = getCategoryMeta(section.slug);
                            return (
                              <div key={`loading-${section.slug}`}>
                                <div className="flex items-start justify-between gap-2 px-1">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.accent }}>
                                      {section.title}
                                    </p>
                                    {section.subtitle ? (
                                      <p className="text-[10px] text-white/45 truncate">{section.subtitle}</p>
                                    ) : null}
                                  </div>
                                  <span className="text-[10px] text-white/35">Closer &larr; &rarr; Farther</span>
                                </div>
                                <div
                                  className="mt-1 flex gap-3 overflow-x-auto scrollbar-hide"
                                  style={{ paddingLeft: "16px", paddingRight: "16px" }}
                                >
                                  {placeholders.map((idx) => (
                                    <div
                                      key={`${section.slug}-skeleton-${idx}`}
                                      className="w-[280px] flex-shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-white/5"
                                    >
                                      <div className="aspect-square bg-white/5 animate-pulse" />
                                      <div className="p-3 space-y-2">
                                        <div className="h-3 rounded bg-white/10 w-3/4 animate-pulse" />
                                        <div className="h-3 rounded bg-white/10 w-1/2 animate-pulse" />
                                        <div className="h-3 rounded bg-white/10 w-2/3 animate-pulse" />
                                        <div className="h-8 rounded bg-white/10 w-full animate-pulse" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {slowNearbyLoading ? (
                            <div className="px-1 text-[11px] text-white/55">
                              {t(isGoldTenant ? "buyer.feed.expandingGold" : "buyer.feed.expandingGeneral")}
                            </div>
                          ) : null}
                        </div>
                      );
                    }

                    if (!total) {
                      const isAdminUser = session.user?.currentMode === "admin" || session.hasRole?.("admin" as any);
                      const nextRadius = getNextRetailRadiusKm(radiusKm);
                      const hasLoadError = Boolean((nearbyData as any)?.__error || (feedData as any)?.__error);
                      const sellerCount = shops.length;
                      const sellersWithProducts = shops.filter((s: any) => (s?.products?.length ?? 0) > 0).length;
                      const title = noProductsTitle;
                      const description = hasLoadError
                        ? t("buyer.noProducts.desc.loadError")
                        : selectedCategory
                          ? t("buyer.noProducts.desc.category")
                          : sellerCount === 0
                            ? t("buyer.noProducts.desc.noSellers")
                            : sellersWithProducts === 0
                              ? t("buyer.noProducts.desc.sellersNoProducts")
                              : t("buyer.noProducts.desc.generic");
                      return (
                        <div className="h-full flex items-center justify-center px-4">
                          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-md shadow-[0_0_30px_rgba(0,0,0,0.45)]">
                            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                              <MapPin className="h-5 w-5 text-amber-300" />
                            </div>
                            <p className="text-base font-semibold text-white">{title}</p>
                            <p className="mt-1 text-[12px] text-white/60">{description}</p>
                            <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-white/55">
                              <span>{sellerCount} sellers</span>
                              {useProximityRadius ? (
                                <>
                                  <span className="text-white/25">•</span>
                                  <span>{radiusKm} km radius</span>
                                </>
                              ) : null}
                            </div>
                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                              {isAdminUser ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                                    onClick={() => navigate("/admin/marketplace/products")}
                                  >
                                    {t("admin.addProduct")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="bg-white/10 hover:bg-white/15 text-white"
                                    disabled={seedInventoryLoading}
                                    onClick={() => seedSyntheticInventory(10)}
                                  >
                                    {seedInventoryLoading ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin text-amber-300" />
                                    ) : (
                                      <Sparkles className="h-4 w-4 mr-2 text-amber-300" />
                                    )}
                                    {t("admin.seedInventory")}
                                  </Button>
                                </>
                              ) : (
                                useProximityRadius ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={nextRadius == null}
                                    onClick={() => {
                                      if (nextRadius != null) setRadiusKm(nextRadius);
                                    }}
                                  >
                                    {nextRadius != null
                                      ? `${t("buyer.expandTo")} ${nextRadius}km`
                                      : t("buyer.expandRadius")}
                                  </Button>
                                ) : null
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-white/15 text-white/80 hover:bg-white/10"
                                onClick={() => setSelectedCategory(null)}
                                disabled={!selectedCategory}
                              >
                                {t("common.clearFilter")}
                              </Button>
                              {useProximityRadius ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-white/15 text-white/80 hover:bg-white/10"
                                  onClick={() => {
                                    setLocationPromptMode("prompt");
                                    setLocationPromptOpen(true);
                                  }}
                                >
                                  {t("location.set")}
                                </Button>
                              ) : null}
                              {hasLoadError ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-white/15 text-white/80 hover:bg-white/10"
                                  onClick={() => {
                                    queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/nearby"] });
                                    queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/feed"] });
                                  }}
                                >
                                  Retry
                                </Button>
                              ) : null}
                            </div>
                            {isAdminUser ? (
                              <p className="mt-3 text-[10px] text-white/45">
                                Seeding creates fictional sellers/products (no real addresses/phones).
                              </p>
                            ) : null}
                            <p className="mt-2 text-[10px] text-white/45">
                              {useProximityRadius
                                ? `${activeLocationLabel ? `Location: ${activeLocationLabel}` : "Location: not set"} • Radius: ${radiusKm}km`
                                : "Catalog scope: global inventory"}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {panelSections.map((section, sectionIdx) => {
                          const products = retailDisplayByCategoryResolved[section.slug] || [];

                          const meta = getCategoryMeta(section.slug);
                          if (!products.length) {
                            const isAdminUser = session.user?.currentMode === "admin" || session.hasRole?.("admin" as any);
                            const nextRadius = getNextRetailRadiusKm(radiusKm);
                            const hasActiveFilter = Boolean(selectedCategory) || String(searchQuery || "").trim().length > 0;
                            const showLoading =
                              section.slug === "gold-art" && goldArtNeedsFallback && goldArtFallbackQuery.isFetching;
                            return (
                              <div key={section.slug}>
                                <div className="flex items-start justify-between gap-2 px-1">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.accent }}>
                                      {section.title}
                                    </p>
                                    {section.subtitle ? (
                                      <p className="text-[10px] text-white/45 truncate">{section.subtitle}</p>
                                    ) : null}
                                  </div>
                                  <span className="text-[10px] text-white/45">0</span>
                                </div>

                                <div className="mt-2 mx-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                                  <p className="text-sm font-semibold text-white">
                                    {showLoading
                                      ? t("common.loading")
                                      : noProductsTitle}
                                  </p>
                                  <p className="mt-1 text-[11px] text-white/60">
                                    {showLoading
                                      ? t(isGoldTenant ? "buyer.feed.expandingGold" : "buyer.feed.expandingGeneral")
                                      : isAdminUser
                                        ? t("admin.noProducts.desc.addProduct")
                                        : t("buyer.noProducts.desc.category")}
                                  </p>
                                  <div className="mt-3 flex items-center gap-2">
                                    {isAdminUser ? (
                                      <Button
                                        size="sm"
                                        className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                                        onClick={() => navigate("/admin/marketplace/products")}
                                      >
                                        {t("admin.addProduct")}
                                      </Button>
                                    ) : (
                                      useProximityRadius ? (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          disabled={nextRadius == null}
                                          onClick={() => {
                                            if (nextRadius != null) setRadiusKm(nextRadius);
                                          }}
                                        >
                                          {nextRadius != null
                                            ? `${t("buyer.expandTo")} ${nextRadius}km`
                                            : t("buyer.expandRadius")}
                                        </Button>
                                      ) : null
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-white/15 text-white/80 hover:bg-white/10"
                                      onClick={() => {
                                        setSelectedCategory(null);
                                        setSearchQuery("");
                                      }}
                                      disabled={!hasActiveFilter}
                                    >
                                      {t("common.clearFilter")}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          const ui = railScrollUi[section.slug];
                          const atStart = ui?.atStart ?? true;
                           const atEnd = ui?.atEnd ?? false;
                           const progress = ui?.progress ?? 0;
                           const thumbPct = ui?.thumbPct ?? 35;
                           const showHint = retailScrollHintState !== "hidden" && sectionIdx === 0;
                           const pulseRight = showHint && !atEnd ? "animate-pulse" : "";
                           const showRailControls = isDesktopRetail || activeRailSlug === section.slug || showHint;
                           const showLeftControl = showRailControls;
                           const showRightControl = showRailControls;

                           return (
                             <div key={section.slug}>
                               <div className="flex items-start justify-between gap-2 px-1">
                                 <div className="min-w-0">
                                   <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.accent }}>
                                     {section.title}
                                   </p>
                                   {section.subtitle ? (
                                     <p className="text-[10px] text-white/45 truncate">{section.subtitle}</p>
                                   ) : null}
                                 </div>
                                 <div className="flex items-center gap-2 text-[10px] text-white/45 whitespace-nowrap">
                                   <span>{products.length}</span>
                                   <span className="text-white/25">•</span>
                                   <span className="hidden lg:inline">Closer &larr; &rarr; Farther</span>
                                 </div>
                               </div>

                              <div className="relative mt-0.5">
                                <div
                                  ref={(el) => {
                                    railRefs.current[section.slug] = el;
                                    if (!el) return;
                                    requestAnimationFrame(() => {
                                      updateRailScrollUiState(section.slug);
                                      initRetailRailScroll(section.slug, products.length);
                                    });
                                  }}
                                  className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-smooth cursor-grab active:cursor-grabbing select-none"
                                  style={{ paddingLeft: "16px", paddingRight: "16px", touchAction: "pan-y" }}
                                  onScroll={() => handleRetailRailScroll(section.slug)}
                                  onMouseEnter={() => setActiveRailSlug(section.slug)}
                                  onWheel={(e) => handleRetailRailWheel(section.slug, e)}
                                  onPointerDown={(e) => startRetailRailPointerDrag(section.slug, e)}
                                  onPointerMove={(e) => handleRetailRailPointerMove(section.slug, e)}
                                  onPointerUp={(e) => stopRetailRailPointerDrag(section.slug, e)}
                                  onPointerCancel={(e) => stopRetailRailPointerDrag(section.slug, e)}
                                >
                                  {products.map((product: any, idx: number) => {
                                  const badge = getCategoryBadge(product);
                                  const stock = getProductStockLabel(product);
                                  const price = getProductPriceDisplay(product);
                                  const isAvailable = stock.inStock;
                                  const shopId = Number(product?.shopId ?? product?.sellerId ?? product?.seller_id);
                                  const distanceLabel = formatDistanceAway(getProductDistanceKm(product)) ?? t("location.setToSeeDistance");
                                  const isAdminUser = session.user?.currentMode === "admin" || session.hasRole?.("admin" as any);
                                  const hasRealImages = collectProductImages(product).length > 0;

                                  return (
                                    <div
                                      key={`${section.slug}-${product.id}`}
                                      data-shop-id={Number.isFinite(shopId) ? String(shopId) : undefined}
                                      className={`group w-[280px] flex-shrink-0 snap-center rounded-2xl overflow-hidden border bg-white/5 transition-colors cursor-pointer ${
                                        isAvailable ? "border-white/10 hover:border-amber-500/25 hover:bg-white/7" : "border-white/10 opacity-60"
                                      }`}
                                      onMouseEnter={() => setHoveredRailShopId(Number.isFinite(shopId) ? shopId : null)}
                                      onMouseLeave={() => setHoveredRailShopId(null)}
                                      onFocus={() => setActiveRailSlug(section.slug)}
                                      onClick={() => {
                                        if (holdScrollRef.current.suppressClick) {
                                          holdScrollRef.current.suppressClick = false;
                                          return;
                                        }
                                        if (Date.now() < railClickSuppressUntilRef.current) return;
                                        setSelectedProduct(product);
                                      }}
                                    >
                                      <div className="aspect-square overflow-hidden relative">
                                        <img
                                          src={getCommodityImage(product)}
                                          alt={product.name}
                                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                          onError={(e) => {
                                            e.currentTarget.onerror = null;
                                            e.currentTarget.src = buildProductPlaceholder(product, idx);
                                          }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                        <div className="absolute top-2 left-2 flex gap-1">
                                          <Badge className={`text-[9px] px-2 py-0.5 ${badge.className}`}>{badge.label}</Badge>
                                          {isAdminUser && !hasRealImages ? (
                                            <button
                                              type="button"
                                              className="h-7 w-7 rounded-full bg-black/55 border border-amber-500/30 text-amber-200 hover:bg-black/75 flex items-center justify-center"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/admin/marketplace/products?images=${encodeURIComponent(String(product.id))}`);
                                              }}
                                              title="Edit product images"
                                              aria-label="Edit product images"
                                            >
                                              <Wrench className="h-4 w-4" />
                                            </button>
                                          ) : null}
                                        </div>
                                        <div className="absolute top-2 right-2">
                                          <Badge
                                            className={`text-[9px] px-2 py-0.5 ${
                                              isAvailable
                                                ? "bg-emerald-500/80 text-white border-emerald-400/50"
                                                : "bg-rose-500/80 text-white border-rose-400/50"
                                            }`}
                                          >
                                            {stock.text}
                                          </Badge>
                                        </div>

                                        <div className="absolute bottom-0 left-0 right-0 p-2">
                                          <div className="flex items-end justify-between gap-3">
                                            <div className="min-w-0">
                                              <p className="text-sm font-semibold text-white truncate drop-shadow">{product.name}</p>
                                              <div className="text-[11px] text-white/70 flex items-center gap-1 min-w-0 drop-shadow">
                                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                                <span className="flex-shrink-0">{distanceLabel}</span>
                                                <span className="text-white/35 flex-shrink-0">•</span>
                                                <span className="min-w-0 truncate text-white/60">{product.shopName}</span>
                                              </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                              <p className="text-sm font-bold text-amber-300 drop-shadow">{price.primary}</p>
                                              {price.secondary ? (
                                                <p className="text-[11px] text-white/45 drop-shadow">{price.secondary}</p>
                                              ) : null}
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="p-3 flex items-center justify-between gap-2">
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="bg-white/10 hover:bg-white/15 text-white"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedProduct(product);
                                          }}
                                        >
                                          {t("common.view")}
                                        </Button>
                                        <Button
                                          size="icon"
                                          className={`h-9 w-9 rounded-full ${
                                            isAvailable
                                              ? "bg-amber-500/90 hover:bg-amber-500 text-black"
                                              : "bg-gray-600/50 text-gray-400 cursor-not-allowed"
                                          }`}
                                          disabled={!isAvailable}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isAvailable) addToCart(product, null);
                                          }}
                                        >
                                          <Plus className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                  })}
                                </div>

                                <div
                                  className={`pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-black/75 to-transparent transition-opacity duration-200 ${
                                    atStart ? "opacity-0" : "opacity-100"
                                  }`}
                                />
                                <div
                                  className={`pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-black/75 to-transparent transition-opacity duration-200 ${
                                    atEnd ? "opacity-0" : "opacity-100"
                                  }`}
                                />

                                {showHint ? (
                                  <div
                                    className={`pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 z-20 transition-opacity duration-300 ${
                                      retailScrollHintState === "fading" ? "opacity-0" : "opacity-100"
                                    }`}
                                  >
                                    <div className="px-3 py-1 rounded-full bg-black/50 border border-white/10 text-[11px] text-white/80 backdrop-blur-sm shadow-[0_0_14px_rgba(245,158,11,0.18)]">
                                      Scroll to explore nearby products &rarr;
                                    </div>
                                  </div>
                                ) : null}

                                  <button
                                    type="button"
                                    aria-label="Scroll left"
                                    disabled={atStart}
                                    className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 h-14 w-14 rounded-full border backdrop-blur-md shadow-xl shadow-black/40 transition-opacity duration-200 ${
                                      showLeftControl ? "" : "opacity-0 pointer-events-none"
                                    } ${
                                      atStart
                                        ? "opacity-30 cursor-default bg-black/25 border-white/10 text-white/40"
                                        : "opacity-95 bg-black/55 border-white/20 text-amber-200 hover:opacity-100 hover:bg-black/70 hover:border-amber-500/40 hover:text-amber-100 hover:shadow-[0_0_18px_rgba(245,158,11,0.28)]"
                                    }`}
                                    onPointerDown={(e) => {
                                      e.preventDefault();
                                      startHoldRailScroll(section.slug, -1);
                                    }}
                                    onPointerLeave={stopHoldRailScroll}
                                    onPointerUp={stopHoldRailScroll}
                                    onPointerCancel={stopHoldRailScroll}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      if (holdScrollRef.current.suppressClick) {
                                        holdScrollRef.current.suppressClick = false;
                                        return;
                                      }
                                      scrollRetailRailBy(section.slug, -1);
                                    }}
                                  >
                                    <div className="h-full w-full flex items-center justify-center">
                                      <ChevronLeft className="h-8 w-8" />
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    aria-label="Scroll right"
                                    disabled={atEnd}
                                    className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 h-14 w-14 rounded-full border backdrop-blur-md shadow-xl shadow-black/40 transition-opacity duration-200 ${pulseRight} ${
                                      showRightControl ? "" : "opacity-0 pointer-events-none"
                                    } ${
                                      atEnd
                                        ? "opacity-30 cursor-default bg-black/25 border-white/10 text-white/40"
                                        : "opacity-95 bg-black/55 border-white/20 text-amber-200 hover:opacity-100 hover:bg-black/70 hover:border-amber-500/40 hover:text-amber-100 hover:shadow-[0_0_18px_rgba(245,158,11,0.28)]"
                                    }`}
                                    onPointerDown={(e) => {
                                      e.preventDefault();
                                      startHoldRailScroll(section.slug, 1);
                                    }}
                                    onPointerLeave={stopHoldRailScroll}
                                    onPointerUp={stopHoldRailScroll}
                                    onPointerCancel={stopHoldRailScroll}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      if (holdScrollRef.current.suppressClick) {
                                        holdScrollRef.current.suppressClick = false;
                                        return;
                                      }
                                      scrollRetailRailBy(section.slug, 1);
                                    }}
                                  >
                                    <div className="h-full w-full flex items-center justify-center">
                                      <ChevronRight className="h-8 w-8" />
                                    </div>
                                  </button>
                                </div>

                                <div className="mt-2 px-1">
                                  <div
                                    ref={(el) => {
                                      railScrollbarTrackRefs.current[section.slug] = el;
                                    }}
                                    className={`relative h-3 rounded-full bg-black/35 border border-white/10 overflow-hidden cursor-grab active:cursor-grabbing ${
                                      atStart && atEnd ? "opacity-40" : "opacity-100"
                                    }`}
                                    style={{ touchAction: "none" }}
                                    onPointerDown={(e) => startRetailRailScrubberDrag(section.slug, e)}
                                    onPointerMove={(e) => handleRetailRailScrubberMove(section.slug, e)}
                                    onPointerUp={(e) => stopRetailRailScrubberDrag(section.slug, e)}
                                    onPointerCancel={(e) => stopRetailRailScrubberDrag(section.slug, e)}
                                  >
                                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 h-3 rounded-full bg-amber-500/85 border border-amber-300/60 shadow-[0_0_10px_rgba(245,158,11,0.28)] pointer-events-none transition-[left] duration-100 ease-out"
                                      style={{ width: `${thumbPct}%`, left: `${progress * (100 - thumbPct)}%` }}
                                    >
                                      <div className="h-full w-full flex items-center justify-center">
                                        <div className="h-full w-full flex items-center justify-center gap-1 px-2">
                                          <ChevronLeft className="h-3 w-3 text-black/45" />
                                          <div className="h-2 w-10 rounded-full bg-black/20 border border-white/15" />
                                          <ChevronRight className="h-3 w-3 text-black/45" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                            </div>
                          );
                        })}

                        <div className="pt-4 border-t border-white/10">
                          <div className="flex items-center justify-between px-1">
                            <p className="text-[11px] font-semibold text-white/85">{t("common.categories")}</p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="text-[10px] text-amber-300/90 hover:text-amber-200 transition-colors"
                                onClick={() => setCategoriesSheetOpen(true)}
                              >
                                {t("common.browse")}
                              </button>
                              <button
                                type="button"
                                className="text-[10px] text-amber-300/90 hover:text-amber-200 transition-colors disabled:opacity-40 disabled:cursor-default"
                                onClick={() => setSelectedCategory(null)}
                                disabled={!selectedCategory}
                              >
                                {t("common.clear")}
                              </button>
                            </div>
                          </div>
                          <ScrollArea className="mt-2 max-h-[260px]">
                            <div className="space-y-1 pr-2">
                              {categories.map((cat: any) => (
                                <button
                                  key={`bottom-cat-${cat.id}`}
                                  className={`w-full flex items-center gap-2 text-xs py-2 px-3 rounded-lg transition-all min-h-[36px] ${
                                    selectedCategory === cat.slug
                                      ? "bg-amber-500/30 text-amber-300 backdrop-blur-sm border border-amber-500/25"
                                      : "text-white/80 hover:text-white hover:bg-white/10 border border-transparent"
                                  }`}
                                  onClick={() => setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug)}
                                >
                                  <span className="drop-shadow-md">{cat.icon || categoryIcons[cat.slug] || "•"}</span>
                                  <span className="drop-shadow-lg font-medium">{cat.name}</span>
                                </button>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  panelSections.map((section) => {
                    const products = panelByCategory[section.slug] || [];
                    const meta = getCategoryMeta(section.slug);
                    if (!products.length) {
                      const isAdminUser = session.user?.currentMode === "admin" || session.hasRole?.("admin" as any);
                      return (
                        <div key={section.slug} className="mb-4 last:mb-0">
                          <div className="flex items-start justify-between gap-2 px-1">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.accent }}>
                                {section.title}
                              </p>
                              <p className="text-[10px] text-white/45 truncate">{section.subtitle}</p>
                            </div>
                          </div>
                          <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="text-sm text-white/80 font-medium">
                              {noProductsTitle}
                            </div>
                            <div className="text-[11px] text-white/60 mt-1">
                              {isAdminUser ? t("admin.noProducts.desc.addProduct") : t("buyer.noProducts.desc.category")}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              {isAdminUser ? (
                                <Button
                                  size="sm"
                                  className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                                  onClick={() => navigate("/admin/marketplace/products")}
                                >
                                  {t("admin.addProduct")}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setSelectedCategory(null);
                                  }}
                                >
                                  {t("buyer.exploreAll")}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-white/15 text-white/80 hover:bg-white/10"
                                onClick={() => setSelectedCategory(null)}
                                disabled={!selectedCategory}
                              >
                                {t("common.clearFilter")}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const visibleProducts = products;

                    return (
                      <div key={section.slug} className="mb-4 last:mb-0">
                        <div className="flex items-start justify-between gap-2 px-1">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.accent }}>
                              {section.title}
                            </p>
                            <p className="text-[10px] text-white/45 truncate">{section.subtitle}</p>
                          </div>
                        </div>

                        <div className={`mt-2 space-y-2 ${section.slug === "jewelry" ? "opacity-90" : ""}`}>
                          {visibleProducts.map((product: any) => {
                            const badge = getCategoryBadge(product);
                            const stock = getProductStockLabel(product);
                            const price = getProductPriceDisplay(product);
                            const isAvailable = stock.inStock;

                            return (
                              <div
                                key={product.id}
                                className={`rounded-xl border transition-colors cursor-pointer ${
                                  section.slug === "jewelry"
                                    ? "bg-white/3 border-white/10 hover:border-yellow-500/30 hover:bg-white/5"
                                    : "bg-white/5 border-white/10 hover:border-amber-500/25 hover:bg-white/7"
                                } ${!isAvailable ? "opacity-60" : ""}`}
                                onClick={() => setSelectedProduct(product)}
                              >
                                <div className="flex items-center gap-3 p-2">
                                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                                    <img
                                      src={getCommodityImage(product)}
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = buildProductPlaceholder(product, 1);
                                      }}
                                    />
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <Badge className={`text-[8px] px-1.5 py-0.5 ${badge.className}`}>
                                            {badge.label}
                                          </Badge>
                                          <span className={`text-[9px] ${isAvailable ? "text-emerald-400" : "text-rose-400"}`}>
                                            {stock.text}
                                          </span>
                                        </div>
                                        <p className="text-xs font-medium text-white truncate mt-1">{product.name}</p>
                                        <p className="text-[10px] text-white/55 truncate">{product.shopName}</p>
                                        <p className="text-[10px] text-white/45 flex items-center gap-1 truncate">
                                          <MapPin className="h-3 w-3" />
                                          {formatDistanceAway(getProductDistanceKm(product)) ?? t("location.setToSeeDistance")}
                                        </p>
                                      </div>

                                      <div className="text-right flex-shrink-0">
                                        <p className="text-amber-400 font-bold text-xs">{price.primary}</p>
                                        {price.secondary && <p className="text-[10px] text-white/40">{price.secondary}</p>}
                                      </div>
                                    </div>
                                  </div>

                                  <Button
                                    size="icon"
                                    className={`h-8 w-8 rounded-full ${
                                      isAvailable
                                        ? "bg-amber-500/90 hover:bg-amber-500 text-black"
                                        : "bg-gray-600/50 text-gray-400 cursor-not-allowed"
                                    }`}
                                    disabled={!isAvailable}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isAvailable) addToCart(product, null);
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showProducts && !isWholesalePreview && marketMode === "machinery" && (
        <div className="absolute bottom-0 left-0 right-0 md:bottom-auto md:top-[calc(env(safe-area-inset-top,0px)+132px)] lg:top-[calc(env(safe-area-inset-top,0px)+116px)] md:right-3 md:left-auto z-40 w-full md:w-[360px] bg-black/70 md:bg-black/55 md:backdrop-blur-xl md:rounded-2xl md:border md:border-sky-500/20 safe-area-bottom">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">{t("nav.machinery")}</h3>
              <p className="text-[10px] text-white/50">Equipment catalog • buy, request, deploy</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 rounded-full"
              onClick={() => setShowProducts(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="px-4 py-3 space-y-2">
            <Button
              size="sm"
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-black font-semibold"
              onClick={() => setCustomEquipmentOpen(true)}
            >
              Request Custom Equipment
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="h-9 rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                value={machineryFilters.category}
                onChange={(e) => setMachineryFilters((p) => ({ ...p, category: e.target.value as any }))}
              >
                <option value="all">Category</option>
                <option value="extraction">Extraction</option>
                <option value="processing">Processing</option>
                <option value="support">Support</option>
                <option value="mobility">Mobility</option>
                <option value="spare_parts">Spare Parts</option>
              </select>
              <select
                className="h-9 rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                value={machineryFilters.condition}
                onChange={(e) => setMachineryFilters((p) => ({ ...p, condition: e.target.value as any }))}
              >
                <option value="all">Condition</option>
                <option value="new">New</option>
                <option value="refurbished">Refurbished</option>
                <option value="used">Used</option>
              </select>
              <select
                className="h-9 rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                value={machineryFilters.status}
                onChange={(e) => setMachineryFilters((p) => ({ ...p, status: e.target.value as any }))}
              >
                <option value="all">Availability</option>
                <option value="in_stock">In stock</option>
                <option value="built_to_order">Built-to-order</option>
                <option value="used">Used (second-hand)</option>
                <option value="reserved">Reserved</option>
                <option value="unavailable">Unavailable</option>
              </select>
              <select
                className="h-9 rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                value={machineryFilters.country}
                onChange={(e) =>
                  setMachineryFilters((p) => ({ ...p, country: e.target.value as any, region: "all" }))
                }
              >
                <option value="all">Country</option>
                {machineryCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                value={machineryFilters.region}
                onChange={(e) => setMachineryFilters((p) => ({ ...p, region: e.target.value as any }))}
              >
                <option value="all">Region</option>
                {machineryRegionsForCountry.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:hidden overflow-x-auto pb-[calc(var(--bottom-stack-height)+16px)] px-3 scrollbar-hide">
            <div className="flex gap-3" style={{ width: "max-content" }}>
              {visibleMachinery.map((item) => (
                <Card
                  key={item.id}
                  className="w-[320px] bg-white/5 border-white/10 hover:border-sky-500/30 transition-colors cursor-pointer flex-shrink-0"
                  onClick={() => setSelectedMachinery(item)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-black/30">
                        <img
                          src={item.images?.[0]}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = "/generated-icon.png";
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                            <p className="text-[11px] text-white/60 truncate">
                              {formatMachineryCategory(item.category, t)} • {formatMachineryCondition(item.condition, t)} •{" "}
                              {item.location.country}
                            </p>
                            <p className="text-[10px] text-white/45 truncate mt-0.5">
                              {t("machinery.soldBy")} {formatSellerType(item.sellerType, t)}
                            </p>
                          </div>
                          <Badge className="text-[10px] bg-sky-500/15 text-sky-200 border-sky-400/30">
                            {formatMachineryStatus(item.status, t)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-[11px] text-white/60 truncate">{item.location.region}</div>
                          <div className="text-[12px] font-semibold text-amber-400">
                            {item.price ? formatMoney(item.price.amount, item.price.currency) : "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full mt-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-black font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMachinery(item);
                      }}
                    >
                      {t("common.viewDetails")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {!visibleMachinery.length && (
                <div className="text-white/60 text-sm px-1 py-6">No equipment matches these filters.</div>
              )}
            </div>
          </div>

          <ScrollArea className="hidden md:block max-h-[65vh] pointer-events-auto">
            <div className="space-y-2 px-3 pb-4">
              {visibleMachinery.map((item) => (
                <Card
                  key={item.id}
                  className="bg-white/5 border-white/10 hover:border-sky-500/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedMachinery(item)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 bg-black/30">
                        <img
                          src={item.images?.[0]}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = "/generated-icon.png";
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                            <p className="text-[11px] text-white/60">
                              {formatMachineryCategory(item.category, t)} • {formatMachineryCondition(item.condition, t)} •{" "}
                              {item.location.country}
                            </p>
                            <p className="text-[10px] text-white/45 truncate mt-0.5">
                              {t("machinery.soldBy")} {formatSellerType(item.sellerType, t)}
                            </p>
                          </div>
                          <Badge className="text-[10px] bg-sky-500/15 text-sky-200 border-sky-400/30">
                            {formatMachineryStatus(item.status, t)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-[11px] text-white/60">
                        {item.location.region}
                        {item.financingAvailable ? (
                          <Badge className="ml-2 text-[9px] bg-amber-500/15 text-amber-200 border-amber-400/30">
                            {t("machinery.financingAvailable")}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-[12px] font-semibold text-amber-400">
                        {item.price ? formatMoney(item.price.amount, item.price.currency) : "—"}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-black font-semibold"
                        onClick={(e) => {
                          e.stopPropagation();
                          toast({
                            title: t("machinery.toast.buyRequestTitle"),
                            description: t("machinery.toast.buyRequestDescription"),
                          });
                        }}
                      >
                        {t("secondaryMarket.buy")}
                      </Button>
                      {item.financingAvailable && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast({
                              title: t("machinery.toast.financingRequestTitle"),
                              description: t("machinery.toast.financingRequestDescription"),
                            });
                          }}
                        >
                          {t("machinery.requestFinancing")}
                        </Button>
                      )}
                      {isOperator && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-sky-500/30 text-sky-200 hover:bg-sky-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast({
                              title: t("machinery.toast.deployTitle"),
                              description: t("machinery.toast.deployDescription"),
                            });
                          }}
                        >
                          {t("common.deploy")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {showProducts && !isWholesalePreview && marketMode === "investments" && (
        <div className="absolute bottom-0 left-0 right-0 md:bottom-auto md:top-[calc(env(safe-area-inset-top,0px)+132px)] lg:top-[calc(env(safe-area-inset-top,0px)+116px)] md:right-3 md:left-auto z-40 w-full md:w-[360px] bg-black/70 md:bg-black/55 md:backdrop-blur-xl md:rounded-2xl md:border md:border-emerald-500/20 safe-area-bottom">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">{t("nav.investments")}</h3>
              <p className="text-[10px] text-white/50">{t("investments.subtitle")}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 rounded-full"
              onClick={() => setShowProducts(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="px-4 py-3 space-y-2">
            {cadastreCountryUnavailable ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-100">
                {t("cadastre.unavailable")}
              </div>
            ) : null}
            <Button
              size="sm"
              disabled={cadastreCountryUnavailable}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-semibold disabled:opacity-60"
              onClick={() => setMineListingOpen(true)}
            >
              {t("cadastre.claimCta")}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="h-9 rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                value={investmentFilters.country}
                onChange={(e) => setInvestmentFilters((p) => ({ ...p, country: e.target.value as any, region: "all" }))}
              >
                <option value="all">{t("location.manual.country")}</option>
                {opportunityCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                value={investmentFilters.region}
                onChange={(e) => setInvestmentFilters((p) => ({ ...p, region: e.target.value as any }))}
              >
                <option value="all">{t("location.manual.region")}</option>
                {opportunityRegionsForCountry.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:hidden overflow-x-auto pb-[calc(var(--bottom-stack-height)+16px)] px-3 scrollbar-hide">
            <div className="flex gap-3" style={{ width: "max-content" }}>
              {visibleOpportunities.slice(0, 12).map((op) => (
                <Card
                  key={op.id}
                  className="w-[320px] bg-white/5 border-white/10 hover:border-emerald-500/30 transition-colors cursor-pointer flex-shrink-0"
                  onClick={() => setSelectedOpportunity(op)}
                >
                  <CardContent className="p-3">
                    {(() => {
                      const mine = getMineById(op.mineId);
                      const cadastrePermit = getCadastrePermitForMine(mine);
                      const cadastreOk = isCadastrePermitValid(cadastrePermit);
                      const cadastreSource = mine ? getCadastreSourceForCountry(mine.country) : null;
                      const regionLabel = mine
                        ? `${mine.country} • ${mine.region}`
                        : `${op.location.country} • ${op.location.region}`;
                      return (
                        <>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{op.title}</p>
                            <p className="text-[11px] text-emerald-300">{t("cadastre.badgeVerified")}</p>
                            <p className="text-[11px] text-white/55 truncate">{regionLabel}</p>
                            {cadastreOk ? (
                              <p className="text-[11px] text-white/60">
                                {t("cadastre.permitId")}: {cadastrePermit?.permitId}
                              </p>
                            ) : null}
                            {cadastreOk && cadastreSource?.sourceUrl ? (
                              <a
                                href={cadastreSource.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-emerald-300 hover:text-emerald-200"
                              >
                                {t("cadastre.sourceLink")}
                              </a>
                            ) : null}
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
                            <div>
                              <div className="text-white/45">{t("investments.field.licenseActiveSince")}</div>
                              <div className="font-semibold text-white">{mine?.licenseActiveSinceYear ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-white/45">{t("investments.field.currentCapacity")}</div>
                              <div className="font-semibold text-white">
                                {mine ? `${mine.currentCapacityKgPerMonth} ${t("units.kgPerMonth")}` : "—"}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-white/45">{t("investments.field.historicalProduction")}</div>
                              <div className="font-semibold text-white">
                                {mine
                                  ? `${mine.historicalProductionTotalKg} ${t("units.kg")} ${t("investments.historical.totalSuffix")} • ${mine.historicalProductionLast12MonthsKg} ${t("units.kg")} (${t("investments.historical.last12m")})`
                                  : "—"}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-white/45">{t("investments.field.remainingPotential")}</div>
                              <div className="font-semibold text-white">
                                {mine?.remainingPotential ? t(`investments.potential.${mine.remainingPotential}`) : "—"}
                                {mine?.remainingLifeYearsAtCurrentRate
                                  ? ` • ~${mine.remainingLifeYearsAtCurrentRate} ${
                                      mine.remainingLifeYearsAtCurrentRate === 1 ? t("units.year") : t("units.years")
                                    } ${t("investments.atCurrentRate")}`
                                  : ""}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
                            <div>
                              <div className="text-white/45">{t("investments.field.capitalRequired")}</div>
                              <div className="font-semibold text-amber-400">
                                {formatMoney(op.capitalRequired.amount, op.capitalRequired.currency)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-white/45">{t("investments.field.duration")}</div>
                              <div className="font-semibold text-white">
                                {op.durationMonths} {op.durationMonths === 1 ? t("units.month") : t("units.months")}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] text-white/60">
                            {t("investments.returnModel.rotationIndicative")}
                          </div>
                        </>
                      );
                    })()}
                    <Button
                      size="sm"
                      className="w-full mt-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOpportunity(op);
                      }}
                    >
                      {t("investments.actions.viewOpportunity")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {!visibleOpportunities.length && (
                <div className="text-white/60 text-sm px-1 py-6">{t("investments.empty")}</div>
              )}
            </div>
          </div>

          <ScrollArea className="hidden md:block max-h-[65vh] pointer-events-auto">
            <div className="space-y-2 px-3 pb-4">
              {visibleOpportunities.map((op) => (
                <Card
                  key={op.id}
                  className="bg-white/5 border-white/10 hover:border-emerald-500/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedOpportunity(op)}
                >
                  <CardContent className="p-3">
                    {(() => {
                      const mine = getMineById(op.mineId);
                      const cadastrePermit = getCadastrePermitForMine(mine);
                      const cadastreOk = isCadastrePermitValid(cadastrePermit);
                      const cadastreSource = mine ? getCadastreSourceForCountry(mine.country) : null;
                      const regionLabel = mine ? `${mine.country} – ${mine.region}` : `${op.location.country} – ${op.location.region}`;
                      return (
                        <>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{op.title}</p>
                            <p className="text-[11px] text-emerald-300">{t("cadastre.badgeVerified")}</p>
                            <p className="text-[11px] text-white/55 truncate">{regionLabel}</p>
                            {cadastreOk ? (
                              <p className="text-[11px] text-white/60">
                                {t("cadastre.permitId")}: {cadastrePermit?.permitId}
                              </p>
                            ) : null}
                            {cadastreOk && cadastreSource?.sourceUrl ? (
                              <a
                                href={cadastreSource.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-emerald-300 hover:text-emerald-200"
                              >
                                {t("cadastre.sourceLink")}
                              </a>
                            ) : null}
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
                            <div>
                              <div className="text-white/45">{t("investments.field.licenseActiveSince")}</div>
                              <div className="font-semibold text-white">{mine?.licenseActiveSinceYear ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-white/45">{t("investments.field.currentCapacity")}</div>
                              <div className="font-semibold text-white">
                                {mine ? `${mine.currentCapacityKgPerMonth} ${t("units.kgPerMonth")}` : "—"}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-white/45">{t("investments.field.historicalProduction")}</div>
                              <div className="font-semibold text-white">
                                {mine
                                  ? `${mine.historicalProductionTotalKg} ${t("units.kg")} ${t("investments.historical.totalSuffix")} • ${mine.historicalProductionLast12MonthsKg} ${t("units.kg")} (${t("investments.historical.last12m")})`
                                  : "—"}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-white/45">{t("investments.field.remainingPotential")}</div>
                              <div className="font-semibold text-white">
                                {mine?.remainingPotential ? t(`investments.potential.${mine.remainingPotential}`) : "—"}
                                {mine?.remainingLifeYearsAtCurrentRate
                                  ? ` • ~${mine.remainingLifeYearsAtCurrentRate} ${
                                      mine.remainingLifeYearsAtCurrentRate === 1 ? t("units.year") : t("units.years")
                                    } ${t("investments.atCurrentRate")}`
                                  : ""}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
                            <div>
                              <div className="text-white/45">{t("investments.field.capitalRequired")}</div>
                              <div className="font-semibold text-amber-400">
                                {formatMoney(op.capitalRequired.amount, op.capitalRequired.currency)}
                              </div>
                            </div>
                            <div>
                              <div className="text-white/45">{t("investments.field.duration")}</div>
                              <div className="font-semibold text-white">
                                {op.durationMonths} {op.durationMonths === 1 ? t("units.month") : t("units.months")}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] text-white/60">
                            {t("investments.returnModel.rotationIndicative")}
                          </div>
                        </>
                      );
                    })()}
                    <Button
                      size="sm"
                      className="w-full mt-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOpportunity(op);
                      }}
                    >
                      {t("investments.actions.viewOpportunity")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {selectedProduct && (
        <div className="fixed inset-0 bg-black text-white flex flex-col" style={{ zIndex: "var(--layer-sheet)" }}>
          <div className="flex items-center justify-between px-4 pt-safe pb-3 border-b border-white/10 bg-black/90 backdrop-blur">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setSelectedProduct(null)}
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="text-[12px] text-white/70 truncate">{selectedProduct.shopName || t("nav.marketplace")}</div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white/80 hover:text-rose-400 hover:bg-white/10"
                onClick={() =>
                  toast({
                    title: t("product.favorites.savedTitle"),
                    description: `${selectedProduct.name} - ${t("product.favorites.savedDescription")}`,
                  })
                }
                aria-label="Save"
              >
                <Heart className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white/80 hover:text-white hover:bg-white/10"
                onClick={() => setCartOpen(true)}
                aria-label="Cart"
              >
                <ShoppingCart className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pb-[calc(var(--bottom-stack-height)+96px)]">
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={selectedProductPrimaryImage || getCommodityImage(selectedProduct)}
                alt={selectedProduct.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = buildProductPlaceholder(selectedProduct, 0);
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            </div>

            {selectedProductImages.length > 1 ? (
              <div className="px-4 pt-3">
                <div className="grid grid-cols-3 gap-2">
                  {selectedProductImages.slice(0, 6).map((img, idx) => {
                    const selected = idx === selectedProductImageIndex;
                    return (
                      <button
                        key={`${selectedProduct.id}-thumb-${idx}`}
                        type="button"
                        className={`aspect-square overflow-hidden rounded-lg border bg-black/40 transition-colors ${
                          selected ? "border-amber-400/70" : "border-white/10 hover:border-white/20"
                        }`}
                        onClick={() => setSelectedProductImageIndex(idx)}
                        aria-label={`View image ${idx + 1}`}
                      >
                        <img
                          src={img}
                          alt={`${selectedProduct.name} ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = buildProductPlaceholder(selectedProduct, idx + 1);
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="px-4 py-4 space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`text-[10px] px-2 py-0.5 ${getCategoryBadge(selectedProduct).className}`}>
                    {getCategoryBadge(selectedProduct).label}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-white/15 text-white/70">
                    {(() => {
                      if (!isGoldTenant) return "Seller";
                      const category = getGoldCategory(selectedProduct);
                      if (category === "dore") return t("product.sellerType.wholesaleSupplier");
                      if (category === "jewelry" || category === "gold-art") return t("product.sellerType.jewelryManufacturer");
                      return t("product.sellerType.retailSeller");
                    })()}
                  </Badge>
                </div>
                <h2 className="text-2xl font-semibold text-white leading-tight">{selectedProduct.name}</h2>
                {selectedProductPrice ? (
                  <>
                    <div className="text-xl font-semibold text-amber-400">{selectedProductPrice.primary}</div>
                    {selectedProductPrice.secondary ? (
                      <div className="text-[11px] text-white/60">{selectedProductPrice.secondary}</div>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="text-sm text-white/70">{selectedProduct.shopName}</div>

              {selectedProductTags.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedProductTags.map((tag) => (
                    <Badge
                      key={`${selectedProduct.id}-tag-${normalizeForMatch(tag)}`}
                      variant="outline"
                      className="text-[10px] border-white/10 text-white/55 bg-white/5"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                  {t("badge.govLicensed")}
                </Badge>
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                  {t("badge.assayerVerified")}
                </Badge>
                <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                  {t("badge.lbmaCustody")}
                </Badge>
              </div>

              <div className="space-y-2">
                <details className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-white">{t("productDetails.section.descriptionTitle")}</summary>
                  <p className="mt-2 text-xs text-white/70 leading-relaxed">
                    {selectedProduct.description ||
                      t("productDetails.descriptionFallback")
                        .replace("{product}", selectedProduct.name ?? "")
                        .replace("{shop}", selectedProduct.shopName ?? "")}
                  </p>
                </details>
                <details className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-white">{t("productDetails.section.complianceTitle")}</summary>
                  <p className="mt-2 text-xs text-white/70">
                    {t("productDetails.complianceBody")}
                  </p>
                </details>
                <details className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-white">{t("productDetails.section.deliveryTitle")}</summary>
                  <p className="mt-2 text-xs text-white/70">
                    {t("productDetails.deliveryBody")}
                  </p>
                </details>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-black/90 backdrop-blur px-4 py-3 pb-[calc(var(--bottom-stack-height)+12px)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] text-white/50 uppercase tracking-wide">{t("cart.total")}</div>
                <div className="text-lg font-semibold text-amber-300">
                  {selectedProductPrice?.primary}
                </div>
              </div>
              <Button
                className={`min-h-[44px] px-4 font-semibold ${
                  selectedProductStock.inStock
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black"
                    : "bg-white/10 text-white/40 cursor-not-allowed"
                }`}
                disabled={!selectedProductStock.inStock}
                onClick={() => {
                  addToCart(selectedProduct, null);
                  toast({ title: t("product.addedToOrder"), description: selectedProduct.name });
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("button.addToOrder")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div
          className="absolute inset-0 flex items-start justify-center pt-8 px-4 pointer-events-none"
          style={{
            zIndex: "var(--layer-sheet)",
            ...(isMobile ? { bottom: "calc(var(--bottom-stack-height) + 16px)" } : {}),
          }}
        >
          <div className="w-full max-w-lg bg-black/85 backdrop-blur-2xl rounded-3xl border border-white/10 overflow-hidden pointer-events-auto shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 max-h-full overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-black" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Checkout Assistant</h3>
                  <p className="text-[10px] text-white/50">Completing your order</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 rounded-full"
                onClick={() => setCheckoutOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 px-5 py-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Order Total</p>
                  <p className="text-xl font-bold text-amber-400">
                    {formatMoney(cart.reduce((sum, item) => sum + item.price * item.quantity, 0), "XOF")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Wallet Balance</p>
                  <p className="text-lg font-semibold text-white">
                    {formatMoney(Number(walletData?.wallet?.balance || 0), walletData?.wallet?.currency)}
                  </p>
                </div>
              </div>
            </div>
            
            <ScrollArea className="h-[300px]">
              <div className="p-5 space-y-4">
                {checkoutMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-amber-500 text-black"
                        : "bg-white/10 text-white"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                
                {checkoutStep === 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
                      onClick={() => handleCheckoutResponse("Business", 1)}
                    >
                      <Store className="h-4 w-4 mr-2" />
                      Business
                    </Button>
                    <Button
                      size="sm"
                      className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
                      onClick={() => handleCheckoutResponse("Individual", 1)}
                    >
                      <User className="h-4 w-4 mr-2" />
                      Individual
                    </Button>
                  </div>
                )}

                {checkoutStep === 1 && checkoutData.buyerType === "Business" && (
                  <div className="flex gap-2 pt-2">
                    <Input
                      placeholder="Enter company name..."
                      className="bg-white/10 border-white/10 text-white placeholder:text-white/40"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                          handleCheckoutResponse(e.currentTarget.value, 2);
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                  </div>
                )}

                {checkoutStep === 2 && (
                  <div className="space-y-2 pt-2">
                    <Button
                      className="w-full justify-start bg-gradient-to-r from-amber-500/20 to-amber-600/10 hover:from-amber-500/30 hover:to-amber-600/20 text-white border border-amber-500/30"
                      onClick={() => handleCheckoutResponse("ECE Wallet", 3)}
                    >
                      <Wallet className="h-4 w-4 mr-3 text-amber-400" />
                      <div className="text-left">
                        <p className="font-medium">ECE Wallet</p>
                        <p className="text-[10px] text-white/50">Balance: {formatMoney(Number(walletData?.wallet?.balance || 0), walletData?.wallet?.currency)}</p>
                      </div>
                    </Button>
                    <Button
                      className="w-full justify-start bg-white/5 hover:bg-white/10 text-white border border-white/10"
                      onClick={() => handleCheckoutResponse("Mobile Money", 3)}
                    >
                      <CreditCard className="h-4 w-4 mr-3" />
                      <div className="text-left">
                        <p className="font-medium">Mobile Money</p>
                        <p className="text-[10px] text-white/50">Orange, MTN, Wave</p>
                      </div>
                    </Button>
                    <Button
                      className="w-full justify-start bg-white/5 hover:bg-white/10 text-white border border-white/10"
                      onClick={() => handleCheckoutResponse("Bank Transfer", 3)}
                    >
                      <CreditCard className="h-4 w-4 mr-3" />
                      <div className="text-left">
                        <p className="font-medium">Bank Transfer</p>
                        <p className="text-[10px] text-white/50">Direct bank payment</p>
                      </div>
                    </Button>
                  </div>
                )}

                {checkoutStep === 3 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs text-white/60 mb-2">Quick deposit amounts:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[10000, 25000, 50000, 100000, 250000, 500000].map((amount) => (
                        <Button
                          key={amount}
                          size="sm"
                          className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
                          onClick={() => handleCheckoutResponse(formatMoney(amount, walletData?.wallet?.currency), 4)}
                        >
                          {amount >= 1000 ? `${amount/1000}K` : amount}
                        </Button>
                      ))}
                    </div>
                    <Input
                      placeholder="Or enter custom amount..."
                      className="bg-white/10 border-white/10 text-white placeholder:text-white/40 mt-2"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                          const customAmount = parseInt(e.currentTarget.value.replace(/[^0-9]/g, '')) || 0;
                          handleCheckoutResponse(formatMoney(customAmount, walletData?.wallet?.currency), 4);
                          e.currentTarget.value = "";
                        }
                      }}
                    />
                  </div>
                )}

                {checkoutStep === 5 && (
                  <div className="space-y-3 pt-2">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                      <p className="text-xs text-white/50 mb-2">Order Summary</p>
                      <p className="text-xs text-amber-400/70 mb-2">Buyer: {checkoutData.buyerType} - {checkoutData.companyName}</p>
                      <p className="text-xs text-white/50 mb-2">Payment: {checkoutData.paymentMethod}</p>
                      {cart.map((item) => (
                        <div key={item.productId} className="flex justify-between text-sm text-white py-1">
                          <span>{item.name} x{item.quantity}</span>
                          <span className="text-amber-400">{formatMoney(item.price * item.quantity, "XOF")}</span>
                        </div>
                      ))}
                      <div className="border-t border-white/10 mt-2 pt-2 flex justify-between font-semibold">
                        <span className="text-white">Total</span>
                        <span className="text-amber-400">{formatMoney(cart.reduce((sum, item) => sum + item.price * item.quantity, 0), "XOF")}</span>
                      </div>
                    </div>
                    {cartHasStamped && (
                      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <p className="text-xs text-white/50 mb-2">Pickup location (required for Stamped Gold)</p>
                        {pickupPartnersLoading ? (
                          <div className="flex items-center gap-2 text-xs text-white/60">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading partners…
                          </div>
                        ) : (
                          <select
                            value={pickupPartnerId}
                            onChange={(e) => setPickupPartnerId(e.target.value)}
                            className="w-full bg-white/10 border border-white/10 text-white rounded-lg px-3 py-2 text-sm"
                          >
                            <option value="">Select a partner jeweller…</option>
                            {pickupPartners.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <p className="text-[10px] text-white/50 mt-2">
                          The jeweller will scan the QR and confirm handover at pickup.
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold"
                        onClick={() => {
                          setCheckoutMessages(prev => [...prev, 
                            { role: "user", content: "Confirm Order" },
                            { role: "assistant", content: "Processing your order... Please wait." }
                          ]);
                          setCheckoutStep(6);
                          confirmOrder();
                        }}
                        disabled={orderMutation.isPending || (cartHasStamped && !pickupPartnerId)}
                      >
                        {orderMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Package className="h-4 w-4 mr-2" />
                        )}
                        Confirm Order
                      </Button>
                      <Button
                        variant="outline"
                        className="border-white/20 text-white hover:bg-white/10"
                        onClick={() => setCheckoutOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {checkoutStep === 6 && (
                  <div className="text-center py-4">
                    {orderMutation.isPending ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                        <p className="text-white/70 text-sm">Processing your order...</p>
                      </div>
                    ) : orderMutation.isSuccess ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Package className="h-6 w-6 text-emerald-400" />
                        </div>
                        <p className="text-emerald-400 font-semibold">Order Placed Successfully!</p>
                        <p className="text-white/50 text-sm">Your order has been sent to the producer</p>
                        <Button
                          className="mt-2 bg-amber-500 hover:bg-amber-600 text-black"
                          onClick={() => {
                            setCheckoutOpen(false);
                            setCart([]);
                            navigate("/orders");
                          }}
                        >
                          View My Orders
                        </Button>
                      </div>
                    ) : orderMutation.isError ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                          <X className="h-6 w-6 text-red-400" />
                        </div>
                        <p className="text-red-400 font-semibold">Order Failed</p>
                        <p className="text-white/50 text-sm">Please try again or contact support</p>
                        <Button
                          className="mt-2"
                          variant="outline"
                          onClick={() => setCheckoutStep(5)}
                        >
                          Try Again
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
                <div ref={checkoutEndRef} />
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      

      <div
        className="fixed right-4 flex flex-col items-end gap-2 md:hidden"
        style={{ bottom: modeStackBottomOffset, zIndex: "var(--layer-concierge)" }}
      >
        {[
          {
            key: "retail",
            label: retailModeLabel,
            icon: <Store className="h-5 w-5" />,
            active: buyerMode === "retail" && marketMode !== "investments",
            disabled: false,
            title: "",
            onSelect: () => setRetailMode(),
            activeClasses: "bg-amber-500/15 text-amber-100 border-amber-500/25",
          },
          {
            key: "wholesale",
            label: t("mode.wholesale"),
            icon: <Package className="h-5 w-5" />,
            active: buyerMode === "wholesale" && marketMode === "dore",
            disabled: false,
            title: "",
            onSelect: () => setWholesaleMode("dore"),
            activeClasses: "bg-orange-500/15 text-orange-100 border-orange-500/25",
          },
          ...(buyerMode === "wholesale"
            ? [
                {
                  key: "machinery",
                  label: t("nav.machinery"),
                  icon: <Wrench className="h-5 w-5" />,
                  active: buyerMode === "wholesale" && marketMode === "machinery",
                  disabled: !isWholesaleAuthorized,
                  title: isWholesaleAuthorized ? "" : "Requires approved wholesale access",
                  onSelect: () => setWholesaleMode("machinery"),
                  activeClasses: "bg-sky-500/15 text-sky-100 border-sky-500/25",
                },
                {
                  key: "investments",
                  label: t("nav.investments"),
                  icon: <BriefcaseBusiness className="h-5 w-5" />,
                  active: marketMode === "investments",
                  disabled: false,
                  title: "",
                  onSelect: () => setInvestMode(),
                  activeClasses: "bg-emerald-500/15 text-emerald-100 border-emerald-500/25",
                },
              ]
            : []),
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            title={item.title}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              setModeStackExpanded(false);
            }}
            className={`flex items-center justify-center gap-2 rounded-full border backdrop-blur-xl shadow-xl shadow-black/30 transition-colors ${
              modeStackExpanded ? "px-3 py-2" : "h-11 w-11"
            } ${
              item.active
                ? item.activeClasses
                : "bg-black/60 text-white/80 border-white/15 hover:bg-black/70 hover:text-white"
            } ${item.disabled ? "opacity-40 cursor-not-allowed hover:bg-black/60 hover:text-white/80" : ""}`}
            aria-label={item.label}
          >
            {item.icon}
            {modeStackExpanded ? <span className="text-[11px] font-semibold whitespace-nowrap">{item.label}</span> : null}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setModeStackExpanded((value) => !value)}
          className={`h-11 w-11 rounded-full border border-white/15 bg-black/60 backdrop-blur-xl text-white/80 shadow-xl shadow-black/30 flex items-center justify-center transition-colors hover:bg-black/70 hover:text-white ${
            modeStackExpanded ? "ring-1 ring-amber-400/30" : ""
          }`}
          aria-label={modeStackExpanded ? "Collapse mode menu" : "Expand mode menu"}
        >
          <ChevronRight
            className={`h-5 w-5 transition-transform ${modeStackExpanded ? "rotate-0" : "rotate-180"}`}
          />
        </button>
      </div>

      <button
        type="button"
        className={`fixed right-4 h-14 w-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-xl shadow-amber-500/30 flex items-center justify-center transition-all duration-200 hover:from-amber-300 hover:to-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 ${
          conciergeIsHidden ? "opacity-0 pointer-events-none translate-y-2" : "opacity-100"
        }`}
        style={{ bottom: conciergeBottomOffset, zIndex: "var(--layer-concierge)" }}
        onClick={() => openConcierge({ focus: true })}
        aria-label="Open AI concierge"
        aria-hidden={conciergeIsHidden}
        tabIndex={conciergeIsHidden ? -1 : 0}
      >
        <Bot className="h-6 w-6" />
      </button>

      {conciergeOpen && (
        <div
          className="fixed inset-0 flex items-end bg-black/40 backdrop-blur-[2px]"
          style={{ zIndex: "var(--layer-alert)" }}
          onClick={closeConcierge}
        >
          <div
            className="w-full min-h-[40dvh] h-[45dvh] max-h-[60dvh] bg-[#0b0f14] border-t border-white/10 rounded-t-3xl shadow-2xl flex flex-col px-4 pt-3 pb-4"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              conciergeTouchStartY.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              if (conciergeTouchStartY.current == null) return;
              const endY = e.changedTouches[0]?.clientY ?? conciergeTouchStartY.current;
              const delta = endY - conciergeTouchStartY.current;
              conciergeTouchStartY.current = null;
              if (delta > 80) closeConcierge();
            }}
          >
            <div className="flex items-center justify-center pb-2">
              <div className="h-1.5 w-10 rounded-full bg-white/20" />
            </div>
            <div className="text-center text-sm font-semibold text-white">AI Concierge</div>

            <ScrollArea className="flex-1 mt-3 pr-1">
              <div className="space-y-3">
                {chatMessages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                          isUser
                            ? "bg-amber-500 text-black"
                            : "bg-white/10 text-white"
                        }`}
                      >
                        {isUser ? message.content : getConciergeMessageText(message.content)}
                      </div>
                    </div>
                  );
                })}
                {chatMutation.isPending && (
                  <div className="text-[11px] text-white/50">Thinking...</div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div
              className="mt-3 border-t border-white/10 pt-3"
              style={{
                paddingBottom: `calc(${Math.max(12, keyboardInsetPx + 12)}px + env(safe-area-inset-bottom, 0px))`,
              }}
            >
              <div className="flex items-center gap-2">
                <Input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  placeholder={t("chat.placeholder")}
                  className="h-11 bg-black/40 border-white/10 text-white placeholder:text-white/40"
                />
                <Button
                  type="button"
                  className="h-11 w-11 bg-amber-500 hover:bg-amber-600 text-black p-0"
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || chatMutation.isPending}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(marketMode === "marketplace" || (!isWholesalePreview && marketMode === "dore")) && (
      <div className="absolute top-[calc(env(safe-area-inset-top,0px)+132px)] md:top-[calc(env(safe-area-inset-top,0px)+132px)] lg:top-[calc(env(safe-area-inset-top,0px)+116px)] left-0 md:left-3 z-40 w-full md:w-auto pointer-events-none">
        <div className="hidden md:block mb-2 px-3 md:px-0 pointer-events-auto">
          <p className="text-white text-xs font-medium drop-shadow-lg">
            {buyerMode === "wholesale"
              ? `${shops.length} ${t("product.dore")} supply points`
              : `${shops.length} ${retailModeLabel.toLowerCase()} sellers`}
          </p>
          <p className="text-white/60 text-[10px] drop-shadow-md">
            {buyerMode === "wholesale"
              ? isGoldTenant
                ? "Licensed wholesale supply"
                : "Bulk purchasing, RFQs, and supplier coordination."
              : isGoldTenant
                ? "Stamped gold retail units"
                : retailPanelSubtitle}
          </p>
        </div>
        
        <div className="md:hidden overflow-x-auto scrollbar-hide px-3 pointer-events-auto">
          <div className="flex gap-2 pb-2 snap-x snap-mandatory scroll-px-3">
            {categories.slice(0, 8).map((cat: any) => (
              <button
                key={cat.id}
                className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-full transition-all backdrop-blur-sm min-h-[44px] snap-start ${
                  selectedCategory === cat.slug 
                    ? "bg-amber-500/40 text-amber-300 border border-amber-500/50" 
                    : "bg-black/40 text-white/80 border border-white/10"
                }`}
                onClick={() => setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug)}
              >
                <span>{cat.icon || categoryIcons[cat.slug] || "📦"}</span>
                <span className="font-medium whitespace-nowrap">{cat.name}</span>
              </button>
            ))}
        </div>
      </div>
        
        {!isDesktopRetail ? (
        <ScrollArea className="hidden md:block max-h-[300px] pointer-events-auto">
          <div className="space-y-1">
            {categories.slice(0, 12).map((cat: any) => (
              <button
                key={cat.id}
                className={`flex items-center gap-2 text-xs py-2 px-3 rounded-lg transition-all min-h-[36px] ${
                  selectedCategory === cat.slug 
                    ? "bg-amber-500/30 text-amber-400 backdrop-blur-sm" 
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
                onClick={() => setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug)}
              >
                <span className="drop-shadow-md">{cat.icon || categoryIcons[cat.slug] || "📦"}</span>
                <span className="drop-shadow-lg font-medium">{cat.name}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
        ) : null}
      </div>
      )}

      <Sheet open={!!selectedMachinery} onOpenChange={(open) => !open && setSelectedMachinery(null)}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className="bg-gradient-to-b from-[#0a0f14] to-black backdrop-blur-xl border-l border-sky-500/20 text-white w-full sm:max-w-lg"
          style={{ zIndex: "var(--layer-sheet)" }}
        >
          {selectedMachinery && (
            <>
              <SheetHeader className="border-b border-white/10 pb-4">
                <SheetTitle className="text-white flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                    <Wrench className="h-6 w-6 text-sky-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-left text-lg font-bold truncate">{selectedMachinery.name}</p>
                    <p className="text-[11px] text-white/60">
                      {formatMachineryCategory(selectedMachinery.category, t)} •{" "}
                      {formatMachineryCondition(selectedMachinery.condition, t)} •{" "}
                      {selectedMachinery.location.country}
                    </p>
                  </div>
                </SheetTitle>
              </SheetHeader>

              <div className="pt-4 space-y-4">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {(selectedMachinery.images || []).map((src, idx) => (
                    <div
                      key={`${selectedMachinery.id}-img-${idx}`}
                      className="w-44 h-28 rounded-xl overflow-hidden border border-white/10 bg-black/30 flex-shrink-0"
                    >
                      <img
                        src={src}
                        alt={`${selectedMachinery.name} ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/generated-icon.png";
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="text-[10px] bg-sky-500/15 text-sky-200 border-sky-400/30">
                    {formatMachineryStatus(selectedMachinery.status, t)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-white/15 text-white/70">
                    {t("machinery.soldBy")} {formatSellerType(selectedMachinery.sellerType, t)}
                  </Badge>
                  {selectedMachinery.financingAvailable ? (
                    <Badge className="text-[10px] bg-amber-500/15 text-amber-200 border-amber-400/30">
                      {t("machinery.financingAvailable")}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="text-[10px] border-white/15 text-white/70">
                    {selectedMachinery.location.region}
                  </Badge>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-white/60 uppercase tracking-wider">Specs</p>
                  <div className="mt-2 space-y-1">
                    {Object.entries(selectedMachinery.specs || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-white/60">{k}</span>
                        <span className="text-white/90 font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-white/60 uppercase tracking-wider">Availability</p>
                  <p className="mt-2 text-sm text-white/80">
                    {selectedMachinery.status === "reserved"
                      ? "Reserved for a buyer; fulfillment pending."
                      : selectedMachinery.status === "unavailable"
                        ? "Currently unavailable."
                        : "Available for purchase or deployment."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-black font-semibold"
                      onClick={() => toast({ title: "Buy request", description: "A purchase request has been created." })}
                    >
                      Buy
                    </Button>
                    {selectedMachinery.financingAvailable && (
                      <Button
                        variant="outline"
                        className="border-white/15 text-white/80 hover:bg-white/10"
                        onClick={() => toast({ title: "Financing request", description: "We’ll contact you shortly." })}
                      >
                        Request Financing
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="border-sky-500/30 text-sky-200 hover:bg-sky-500/10"
                      disabled={!isOperator}
                      onClick={() => toast({ title: "Deploy", description: "Deployment flow coming next." })}
                    >
                      Deploy to Mine
                    </Button>
                  </div>
                  {!isOperator && (
                    <p className="mt-2 text-[11px] text-white/50">Deploy requires the Operator role.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedOpportunity} onOpenChange={(open) => !open && setSelectedOpportunity(null)}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className="bg-gradient-to-b from-[#071313] to-black backdrop-blur-xl border-l border-emerald-500/20 text-white w-full sm:max-w-lg"
          style={{ zIndex: "var(--layer-sheet)" }}
        >
          {selectedOpportunity && (
            <>
              <SheetHeader className="border-b border-white/10 pb-4">
                <SheetTitle className="text-white flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <BriefcaseBusiness className="h-6 w-6 text-emerald-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-left text-lg font-bold truncate">{selectedOpportunity.title}</p>
                    <p className="text-[11px] text-emerald-300">{t("cadastre.badgeVerified")}</p>
                  </div>
                </SheetTitle>
              </SheetHeader>

              <div className="pt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="text-[10px] bg-emerald-500/15 text-emerald-200 border-emerald-400/30">
                    {t("cadastre.badgeVerified")}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-white/15 text-white/70">
                    {selectedOpportunity.location.country} • {selectedOpportunity.location.region}
                  </Badge>
                </div>

                {selectedCadastreOk ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-[11px] text-white/60 uppercase tracking-wider">{t("cadastre.sectionTitle")}</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-[12px] text-white/80">
                      <div>
                        <p className="text-[11px] text-white/45">{t("cadastre.permitId")}</p>
                        <p className="font-semibold text-white">{selectedCadastrePermit?.permitId ?? "â€”"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-white/45">{t("cadastre.permitStatus")}</p>
                        <p className="font-semibold text-white">{selectedCadastrePermit?.permitStatus ?? "â€”"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-white/45">{t("cadastre.permitType")}</p>
                        <p className="font-semibold text-white">{selectedCadastrePermit?.permitType ?? "â€”"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-white/45">{t("cadastre.commodity")}</p>
                        <p className="font-semibold text-white">{selectedCadastrePermit?.commodity ?? "â€”"}</p>
                      </div>
                    </div>
                    {selectedCadastreSource?.sourceUrl ? (
                      <a
                        href={selectedCadastreSource.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-[11px] text-emerald-300 hover:text-emerald-200"
                      >
                        {t("cadastre.sourceLink")}
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[12px] text-amber-100">
                    {t("cadastre.missing")}
                  </div>
                )}

                {(() => {
                  const mine = getMineById(selectedOpportunity.mineId);
                  return (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[11px] text-white/60 uppercase tracking-wider">{t("investments.snapshot.title")}</p>
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] text-white/45">{t("investments.field.licenseActiveSince")}</p>
                          <p className="text-sm font-semibold text-white">{mine?.licenseActiveSinceYear ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-white/45">{t("investments.field.currentCapacity")}</p>
                          <p className="text-sm font-semibold text-white">
                            {mine ? `${mine.currentCapacityKgPerMonth} ${t("units.kgPerMonth")}` : "—"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] text-white/45">{t("investments.field.historicalProduction")}</p>
                          <p className="text-sm font-semibold text-white">
                            {mine
                              ? `${mine.historicalProductionTotalKg} ${t("units.kg")} ${t("investments.historical.totalSuffix")} • ${mine.historicalProductionLast12MonthsKg} ${t("units.kg")} (${t("investments.historical.last12m")})`
                              : "—"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[11px] text-white/45">{t("investments.field.remainingPotential")}</p>
                          <p className="text-sm font-semibold text-white">
                            {mine?.remainingPotential ? t(`investments.potential.${mine.remainingPotential}`) : "—"}
                            {mine?.remainingLifeYearsAtCurrentRate
                              ? ` • ~${mine.remainingLifeYearsAtCurrentRate} ${
                                  mine.remainingLifeYearsAtCurrentRate === 1 ? t("units.year") : t("units.years")
                                } ${t("investments.atCurrentRate")}`
                              : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-white/60 uppercase tracking-wider">Opportunity Summary</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] text-white/45">{t("investments.field.capitalRequired")}</p>
                      <p className="text-sm font-semibold text-amber-400">
                        {formatMoney(selectedOpportunity.capitalRequired.amount, selectedOpportunity.capitalRequired.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/45">{t("investments.field.duration")}</p>
                      <p className="text-sm font-semibold text-white">
                        {selectedOpportunity.durationMonths}{" "}
                        {selectedOpportunity.durationMonths === 1 ? t("units.month") : t("units.months")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-[11px] text-white/45">Return model</p>
                    <p className="text-sm text-white/80">{t("investments.returnModel.rotationIndicative")}</p>
                    {selectedOpportunity.returnIndicativeRange ? (
                      <p className="text-[12px] text-white/60 mt-1">{selectedOpportunity.returnIndicativeRange}</p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-white/60 uppercase tracking-wider">Capital Allocation</p>
                  <div className="mt-2 space-y-2">
                    {selectedOpportunity.capitalUse.map((c, idx) => (
                      <div key={`${selectedOpportunity.id}-cap-${idx}`} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-white/90 truncate">{c.label}</p>
                          {"machineryId" in c ? (
                            <p className="text-[11px] text-white/50 truncate">Machinery reference: {c.machineryId}</p>
                          ) : null}
                        </div>
                        {"machineryId" in c ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10"
                            onClick={() => {
                              const target = MACHINERY_ITEMS.find((m) => m.id === c.machineryId) || null;
                              if (!target) return;
                              setMarketMode("machinery");
                              setShowProducts(true);
                              setSelectedOpportunity(null);
                              setSelectedMachinery(target);
                            }}
                          >
                            {t("investments.actions.viewMachinery")}
                          </Button>
                        ) : (
                          <span className="text-[11px] text-white/50">
                            {"amount" in c && c.amount ? formatMoney(c.amount.amount, c.amount.currency) : ""}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-white/60 uppercase tracking-wider">Contract terms (digitally managed)</p>
                  <p className="mt-2 text-sm text-white/80">
                    Participation is explicit and time-bound. Payouts are linked to confirmed revenue events (purchase orders / offtake).
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/15 text-white/80 hover:bg-white/10"
                      onClick={() => setContractPreviewOpen(true)}
                    >
                      Preview contract
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-white/60 uppercase tracking-wider">
                    Authorized Bureau d'Achat that can buy from this mine
                  </p>
                  <p className="mt-2 text-[12px] text-white/60">
                    Only authorized buyers can execute purchase orders via the platform.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {authorizedBureausLoading ? (
                      <p className="text-sm text-white/60">Loading authorized buyers...</p>
                    ) : (authorizedBureaus || []).length ? (
                      (authorizedBureaus || []).slice(0, 4).map((b: any) => (
                        <div key={b.id} className="rounded-lg border border-white/10 bg-black/30 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-white truncate">{b.legalName || b.name}</p>
                            <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30 text-[10px]">
                              AUTHORIZED
                            </Badge>
                          </div>
                          <p className="text-[11px] text-white/60 truncate">
                            {b.country} | {b.region || b.city} | License {b.licenseNumber || b.authorizationNumber || "-"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-white/60">No authorized bureaus found for this region yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] text-white/60 uppercase tracking-wider">Participation</p>
                  <p className="mt-2 text-sm text-white/80">
                    Participation is non-guaranteed and indicative. Payout may be cash or gold equivalent (if supported).
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-semibold"
                      disabled={!isVerifiedInvestor || !selectedCadastreVerified}
                      onClick={() => {
                        if (!session.isAuthenticated) {
                          navigate("/login");
                          return;
                        }
                        if (!selectedCadastreVerified) {
                          toast({ title: "Cadastre required", description: t("cadastre.claimRequired"), variant: "destructive" });
                          return;
                        }
                        setParticipateTemplateKey("revenue_share");
                        setParticipateBureauId(null);
                        setParticipateDraftContract(null);
                        setParticipatePrincipal(String(selectedOpportunity.capitalRequired.amount));
                        setParticipateStep(1);
                        setParticipateOpen(true);
                      }}
                    >
                      Participate
                    </Button>
                    {!isVerifiedInvestor && (
                      <Button
                        variant="outline"
                        className="border-white/15 text-white/80 hover:bg-white/10"
                        onClick={() => {
                          if (!session.isAuthenticated) navigate("/login");
                          else toast({ title: "Locked", description: "Requires Verified Investor role." });
                        }}
                      >
                        Unlock
                      </Button>
                    )}
                    {isVerifiedInvestor && !selectedCadastreVerified && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-200">
                        {t("cadastre.claimRequired")}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={contractPreviewOpen}
        onOpenChange={(open) => {
          setContractPreviewOpen(open);
        }}
      >
        <DialogContent className="bg-gradient-to-b from-[#0a0f14] to-black border-white/10 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">Contract Preview (digitally managed)</DialogTitle>
            <DialogDescription className="text-white/60">
              This preview uses compliance-safe language (revenue share / return per rotation).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={participateTemplateKey === "revenue_share" ? "default" : "outline"}
              className={
                participateTemplateKey === "revenue_share"
                  ? "bg-white/10 text-white"
                  : "border-white/15 text-white/80 hover:bg-white/10"
              }
              onClick={() => setParticipateTemplateKey("revenue_share")}
            >
              Revenue share (time-bound)
            </Button>
            <Button
              size="sm"
              variant={participateTemplateKey === "premium_per_rotation" ? "default" : "outline"}
              className={
                participateTemplateKey === "premium_per_rotation"
                  ? "bg-white/10 text-white"
                  : "border-white/15 text-white/80 hover:bg-white/10"
              }
              onClick={() => setParticipateTemplateKey("premium_per_rotation")}
            >
              Return per rotation (indicative)
            </Button>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 max-h-[50vh] overflow-auto">
            <pre className="whitespace-pre-wrap text-[12px] text-white/80 leading-relaxed">
{`DIGITALLY MANAGED CONTRACT (Preview)

Mine reference: ${selectedOpportunity?.mineId || "—"}
Cadastre permit: ${selectedCadastrePermit?.permitId || "—"}
Authorized Bureau d’Achat: (selected during participation)

Start date: (on activation)
End date: (time-bound)

Return model: ${
  participateTemplateKey === "revenue_share"
    ? "revenue share (% of confirmed net revenue)"
    : "return per rotation (indicative) (% of principal, rotation-based)"
}
Payout frequency: ${participateTemplateKey === "revenue_share" ? "per confirmed sale" : "per rotation"}

Compliance note: This is a digitally managed contract linking payouts to confirmed revenue events (purchase orders / offtake).
Only authorized buyers can execute purchase orders via the platform.

Signatures
- Party A: Mine (owner/licensed entity)
- Party B: Investor
- Party C (optional): Authorized Bureau d’Achat`}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={participateOpen}
        onOpenChange={(open) => {
          setParticipateOpen(open);
          if (!open) {
            setParticipateSubmitting(false);
            setParticipateSigning(false);
          }
        }}
      >
        <DialogContent className="bg-gradient-to-b from-[#0a0f14] to-black border-white/10 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-white">Create Digital Contract</DialogTitle>
            <DialogDescription className="text-white/60">
              Investment participation is explicit + time-bound, and payouts link to revenue events.
            </DialogDescription>
          </DialogHeader>

          {!selectedOpportunity ? (
            <p className="text-sm text-white/70">Select an opportunity first.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-white/60 uppercase tracking-wider">Step {participateStep} of 4</p>
                <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/30 text-[10px]">
                  {selectedOpportunity.durationMonths} months
                </Badge>
              </div>

              {participateStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-white/80">Choose a contract template</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Button
                      variant={participateTemplateKey === "revenue_share" ? "default" : "outline"}
                      className={
                        participateTemplateKey === "revenue_share"
                          ? "bg-white/10 text-white justify-start"
                          : "border-white/15 text-white/80 hover:bg-white/10 justify-start"
                      }
                      onClick={() => setParticipateTemplateKey("revenue_share")}
                    >
                      Revenue share (time-bound)
                    </Button>
                    <Button
                      variant={participateTemplateKey === "premium_per_rotation" ? "default" : "outline"}
                      className={
                        participateTemplateKey === "premium_per_rotation"
                          ? "bg-white/10 text-white justify-start"
                          : "border-white/15 text-white/80 hover:bg-white/10 justify-start"
                      }
                      onClick={() => setParticipateTemplateKey("premium_per_rotation")}
                    >
                      Return per rotation (indicative)
                    </Button>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      className="border-white/15 text-white/80 hover:bg-white/10"
                      onClick={() => setParticipateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button className="bg-amber-500 text-black hover:bg-amber-600" onClick={() => setParticipateStep(2)}>
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {participateStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-white/80">Select an authorized Bureau d’Achat (recommended)</p>
                  <p className="text-[12px] text-white/60">
                    Only authorized buyers can execute purchase orders via the platform.
                  </p>
                  <div className="grid grid-cols-1 gap-2 max-h-[38vh] overflow-auto pr-1">
                    {(authorizedBureaus || []).map((b: any) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`text-left rounded-lg border p-3 transition-colors ${
                          participateBureauId === b.id
                            ? "border-emerald-400/40 bg-emerald-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                        onClick={() => setParticipateBureauId(b.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white truncate">{b.legalName || b.name}</p>
                          <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30 text-[10px]">
                            AUTHORIZED
                          </Badge>
                        </div>
                        <p className="text-[11px] text-white/60 truncate">
                          {b.country} • {b.region || b.city} • License {b.licenseNumber || b.authorizationNumber || "—"}
                        </p>
                      </button>
                    ))}
                    {!authorizedBureausLoading && !(authorizedBureaus || []).length ? (
                      <p className="text-sm text-white/60">No authorized bureaus found for this region yet.</p>
                    ) : null}
                  </div>
                  <div className="flex justify-between gap-2">
                    <Button
                      variant="outline"
                      className="border-white/15 text-white/80 hover:bg-white/10"
                      onClick={() => setParticipateStep(1)}
                    >
                      Back
                    </Button>
                    <Button
                      className="bg-amber-500 text-black hover:bg-amber-600"
                      onClick={() => {
                        if (!participateBureauId) {
                          toast({ title: "Select a bureau", description: "Choose an authorized Bureau d'Achat to continue." });
                          return;
                        }
                        setParticipateStep(3);
                      }}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {participateStep === 3 && (
                <div className="space-y-3">
                  <p className="text-sm text-white/80">Generate contract draft</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      value={participatePrincipal}
                      onChange={(e) => setParticipatePrincipal(e.target.value)}
                      placeholder="Principal amount (USD)"
                      className="bg-black/30 border-white/10 text-white"
                    />
                    <Input value="USD" disabled className="bg-black/30 border-white/10 text-white/70" />
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[12px] text-white/70">
                    <div>Mine: {selectedOpportunity.mineId}</div>
                    <div>Duration: {selectedOpportunity.durationMonths} months</div>
                    <div>
                      Template:{" "}
                      {participateTemplateKey === "revenue_share" ? "Revenue share (time-bound)" : "Return per rotation (indicative)"}
                    </div>
                    <div>Bureau: #{participateBureauId || "—"}</div>
                  </div>
                  <div className="flex justify-between gap-2">
                    <Button
                      variant="outline"
                      className="border-white/15 text-white/80 hover:bg-white/10"
                      onClick={() => setParticipateStep(2)}
                    >
                      Back
                    </Button>
                    <Button
                      className="bg-emerald-500 text-black hover:bg-emerald-600"
                      disabled={participateSubmitting}
                      onClick={async () => {
                        const amount = Number(participatePrincipal);
                        if (!Number.isFinite(amount) || amount <= 0) {
                          toast({ title: "Montant invalide", description: "Saisissez un montant valide." });
                          return;
                        }
                        if (!session.token) {
                          toast({ title: "Connexion requise", description: "Veuillez vous connecter pour continuer." });
                          navigate("/login");
                          return;
                        }
                        if (!participateBureauId) {
                          toast({ title: "Sélection requise", description: "Choisissez un Bureau d'Achat autorisé pour continuer." });
                          return;
                        }
                        setParticipateSubmitting(true);
                        try {
                          const draft = await apiRequest("/api/digital-contracts/contracts/from-opportunity", {
                            method: "POST",
                            body: JSON.stringify({
                              investmentOpportunityId: selectedOpportunity.id,
                              mineId: selectedOpportunity.mineId,
                              bureauAchatId: participateBureauId,
                              principalAmount: amount,
                              currency: "USD",
                              durationMonths: selectedOpportunity.durationMonths,
                              templateKey: participateTemplateKey === "revenue_share" ? "revenue_share" : "premium_per_rotation",
                            }),
                            headers: { Authorization: `Bearer ${session.token}` },
                          });
                          setParticipateDraftContract(draft);
                          setParticipateStep(4);
                        } catch (err: any) {
                          toast({ title: "Failed", description: err?.message || "Could not create contract draft." });
                        } finally {
                          setParticipateSubmitting(false);
                        }
                      }}
                    >
                      Generate draft
                    </Button>
                  </div>
                </div>
              )}

              {participateStep === 4 && (
                <div className="space-y-3">
                  <p className="text-sm text-white/80">Signature workflow</p>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 max-h-[36vh] overflow-auto">
                    <pre className="whitespace-pre-wrap text-[12px] text-white/80 leading-relaxed">
                      {String(participateDraftContract?.documents?.previewText || "-")}
                    </pre>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      className="bg-amber-500 text-black hover:bg-amber-600"
                      disabled={participateSigning || !participateDraftContract?.contractId}
                      onClick={async () => {
                        if (!session.token) return;
                        const id = String(participateDraftContract?.contractId || "");
                        if (!id) return;
                        setParticipateSigning(true);
                        try {
                          const updated = await apiRequest(`/api/digital-contracts/contracts/${encodeURIComponent(id)}/sign`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${session.token}` },
                          });
                          setParticipateDraftContract(updated);
                          toast({ title: "Signed", description: "Your signature is recorded." });
                        } catch (err: any) {
                          toast({ title: "Sign failed", description: err?.message || "Could not sign contract." });
                        } finally {
                          setParticipateSigning(false);
                        }
                      }}
                    >
                      Sign (Investor)
                    </Button>
                  </div>
                  <p className="text-[12px] text-white/60">
                    Status becomes active after all required parties sign.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedShop} onOpenChange={(open) => !open && setSelectedShop(null)}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={`bg-gradient-to-b from-[#0a0f14] to-black backdrop-blur-xl text-white flex flex-col ${
            isMobile
              ? "h-[82vh] border-t border-amber-500/20 rounded-t-3xl"
              : "w-full sm:max-w-xl border-l border-amber-500/20"
          }`}
          style={{ zIndex: "var(--layer-sheet)" }}
        >
          {selectedShop && (
            <>
              <SheetHeader className="border-b border-amber-500/10 pb-4">
                <SheetTitle className="text-white flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/30 overflow-hidden">
                    <img
                      src={selectedShopCategoryMeta?.image || "/generated-icon.png"}
                      alt={selectedShopCategoryMeta?.label || "Shop"}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/generated-icon.png";
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-left text-lg font-bold truncate">{selectedShop.shopName}</p>
                      <Badge
                        className={`text-[10px] ${
                          isGoldTenant
                            ? selectedShopCategory === "dore"
                              ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                              : selectedShopCategory === "gold-art"
                                ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                                : selectedShopCategory === "jewelry"
                                  ? "bg-violet-500/20 text-violet-200 border-violet-500/30"
                                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-white/5 text-white/70 border-white/10"
                        }`}
                      >
                        {getShopTypeLabel(selectedShop)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <p className="text-[12px] font-normal text-amber-400/80">
                        <MapPin className="h-3 w-3 inline mr-1" />
                        {selectedShopDistanceLabel ?? "Distance unknown"}
                      </p>
                      <p className="text-[11px] text-white/50 truncate max-w-[240px]">{selectedShopLocationLabel}</p>
                      <Badge
                        className={`text-[10px] ${
                          selectedShop.verifiedAt
                            ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30"
                            : "bg-white/5 text-white/70 border-white/10"
                        }`}
                      >
                        {selectedShop.verifiedAt ? "Verified" : "Unverified"}
                      </Badge>
                      <Badge className="text-[10px] bg-white/5 text-white/70 border-white/10 flex items-center gap-1">
                        <Star className="h-3 w-3 text-amber-400" />
                        <span>{selectedShop.rating || "4.7"}</span>
                      </Badge>
                    </div>
                  </div>
                </SheetTitle>
              </SheetHeader>

              {selectedShopWaHref ? (
                <div className="mt-4">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10"
                  >
                    <a href={selectedShopWaHref} target="_blank" rel="noopener noreferrer">
                      {t("common.contactWhatsapp")}
                    </a>
                  </Button>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const products = selectedShop.products ?? [];
                    const categoriesInShop = Array.from(
                      new Set(products.map((p: any) => getCategory(p)).filter(Boolean))
                    ) as string[];

                    const options: { key: string; label: string }[] = [
                      { key: "all", label: "All" },
                      ...categoriesInShop.map((cat) => ({
                        key: cat,
                        label: getCategoryMeta(cat)?.label ?? cat,
                      })),
                    ];

                    return options.map((opt) => {
                      const active = shopProductCategory === opt.key;
                      return (
                        <button
                          key={opt.key}
                          className={`h-8 px-3 rounded-full text-[11px] border transition-colors ${
                            active
                              ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                              : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                          }`}
                          onClick={() => setShopProductCategory(opt.key as any)}
                        >
                          {opt.label}
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
              
              <ScrollArea className="flex-1 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-4 pb-4">
                   {selectedShop.products
                     ?.filter((product: any) => {
                       const category = getCategory(product) || "default";
                       if (shopProductCategory !== "all" && category !== shopProductCategory) return false;
                       return true;
                     })
                     .map((product: any) => {
                     const category = getCategory(product);
                     const meta = getCategoryMeta(category);
                     const isDore = isGoldTenant && category === "dore";
                     const lowerName = product.name?.toLowerCase() || "";
                     const is18K = lowerName.includes("18k") || lowerName.includes("750");
                     const stock = getProductStockLabel(product);
                     const isAvailable = stock.inStock;
                     const isJewelry = isGoldTenant && category === "jewelry";
                     const categoryBadgeLabel = isGoldTenant
                      ? isJewelry
                        ? "ART"
                        : isDore
                          ? t("product.dore").toUpperCase()
                          : is18K
                            ? "18K"
                            : "22K"
                      : meta.label.toUpperCase();
                    const categoryBadgeClass = isGoldTenant
                      ? isJewelry
                        ? "bg-yellow-500/80 text-black"
                        : isDore
                          ? "bg-orange-500/90 text-white"
                          : "bg-emerald-500/90 text-white"
                      : "bg-white/10 text-white";
                    
                    return (
                      <Card
                        key={product.id}
                        role="button"
                        tabIndex={0}
                        className={`bg-gradient-to-b from-white/5 to-black/30 border-white/10 hover:border-amber-500/30 transition-colors overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${
                          isAvailable ? "" : "opacity-60"
                        }`}
                        onClick={() => setSelectedProduct({ ...product, shopName: selectedShop.shopName || selectedShop.name || "Shop" })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedProduct({ ...product, shopName: selectedShop.shopName || selectedShop.name || "Shop" });
                          }
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
                            <div className="aspect-[4/3]">
                              <img
                                src={meta.image}
                                alt={product.name}
                                className="w-full h-full object-cover"
                                loading="eager"
                              />
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                            <div className="absolute top-2 left-2 flex gap-2">
                              <Badge className={`text-[9px] px-2 py-0.5 ${categoryBadgeClass}`}>
                                {categoryBadgeLabel}
                              </Badge>
                            </div>
                            <div className="absolute top-2 right-2">
                              <Badge
                                className={`text-[9px] px-2 py-0.5 ${
                                  isAvailable
                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                    : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                }`}
                              >
                                {stock.text}
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-3 min-w-0">
                            <p className="font-semibold text-white text-sm truncate">{product.name}</p>
                            <p className="text-xs text-white/55 mt-1 truncate">
                              {isJewelry
                                ? product.shortDescription || "Curated heritage piece"
                                : isDore
                                  ? t("product.purity.dore")
                                  : is18K
                                    ? t("product.purity.18k")
                                    : t("product.purity.22k")}
                            </p>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <p className="text-amber-400 font-bold text-sm">
                              {getProductPriceDisplay(product).primary}
                            </p>
                            <Button
                              size="sm"
                              className={`h-8 px-3 ${
                                isAvailable
                                  ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black"
                                  : "bg-white/10 text-white/30 cursor-not-allowed"
                              } font-semibold`}
                              disabled={!isAvailable}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isAvailable) addToCart(product, selectedShop);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                
                <div className="mt-6 p-4 bg-amber-500/5 rounded-xl border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-amber-400" />
                    <p className="text-sm font-semibold text-white">Supplier Certifications</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">{t("badge.govLicensed")}</Badge>
                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">{t("badge.assayerVerified")}</Badge>
                    <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">{t("badge.lbmaCustody")}</Badge>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={categoriesSheetOpen} onOpenChange={setCategoriesSheetOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={`bg-black/95 backdrop-blur-xl text-white flex flex-col ${
            isMobile ? "h-[75vh] border-t border-white/10 rounded-t-3xl" : "w-full sm:max-w-md border-l border-white/10"
          }`}
          style={{ zIndex: "var(--layer-sheet)" }}
        >
          <SheetHeader className="border-b border-white/10 pb-4">
            <SheetTitle className="text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-amber-300" />
                {t("common.categories")}
              </div>
              <button
                type="button"
                className="text-[11px] text-amber-300/90 hover:text-amber-200 transition-colors disabled:opacity-40 disabled:cursor-default"
                onClick={() => {
                  setSelectedCategory(null);
                  setCategoriesSheetOpen(false);
                }}
                disabled={!selectedCategory}
              >
                Clear
              </button>
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 pr-2">
            <div className="p-4 space-y-2">
              <button
                type="button"
                className={`w-full flex items-center gap-2 text-sm py-3 px-3 rounded-xl border transition-colors ${
                  !selectedCategory
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-200"
                    : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                }`}
                onClick={() => {
                  setSelectedCategory(null);
                  setCategoriesSheetOpen(false);
                }}
              >
                <span className="drop-shadow-md">{t("common.allCategories")}</span>
              </button>

              {categories.map((cat: any) => (
                <button
                  key={`sheet-cat-${cat.id}`}
                  type="button"
                  className={`w-full flex items-center gap-2 text-sm py-3 px-3 rounded-xl border transition-colors ${
                    selectedCategory === cat.slug
                      ? "bg-amber-500/20 border-amber-500/30 text-amber-200"
                      : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                  }`}
                  onClick={() => {
                    setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug);
                    setCategoriesSheetOpen(false);
                  }}
                >
                  <span className="drop-shadow-md">{cat.icon || categoryIcons[cat.slug] || "★"}</span>
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={`bg-black/95 backdrop-blur-xl text-white flex flex-col ${
            isMobile ? "h-[82vh] border-t border-white/10 rounded-t-3xl" : "w-full sm:max-w-lg border-l border-white/10"
          }`}
          style={{ zIndex: "var(--layer-sheet)" }}
        >
          <SheetHeader className="border-b border-white/10 pb-4">
            <SheetTitle className="text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-amber-300" />
                {t("cart.title")}
              </div>
              <Badge variant="outline" className="border-white/15 text-white/70 text-[10px]">
                {cart.length} items
              </Badge>
            </SheetTitle>
          </SheetHeader>

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm font-semibold text-white">{t("cart.empty")}</p>
              <p className="mt-1 text-xs text-white/60">{t("cart.emptyHelp")}</p>
              <Button
                className="mt-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold"
                onClick={() => setCartOpen(false)}
              >
                {t("button.viewProducts")}
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 pr-2">
                <div className="mt-4 space-y-3">
                  {(() => {
                    const shopsCount = new Set(cart.map((item) => item.shopId)).size;
                    return shopsCount > 1 ? (
                      <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3">
                        <p className="text-[12px] font-semibold text-rose-200">Multiple shops detected</p>
                        <p className="mt-1 text-[11px] text-rose-100/70">
                          Please order from one shop at a time. Remove items from other shops.
                        </p>
                      </div>
                    ) : null;
                  })()}

                  {cart.map((item) => (
                    <div key={item.productId} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                          <p className="text-[11px] text-white/60 truncate">{item.shopName}</p>
                          <p className="mt-1 text-[11px] text-amber-300">
                            {formatMoney(item.price, "XOF")} × {item.quantity}
                          </p>
                        </div>
                        <div className="text-sm font-semibold text-amber-300 whitespace-nowrap">
                          {formatMoney(item.price * item.quantity, "XOF")}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 border-white/15 text-white/80 hover:bg-white/10"
                            onClick={() => updateCartQuantity(item.productId, -1)}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <div className="min-w-[36px] text-center text-sm font-semibold text-white">{item.quantity}</div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 border-white/15 text-white/80 hover:bg-white/10"
                            onClick={() => updateCartQuantity(item.productId, 1)}
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
                          onClick={() => removeFromCart(item.productId)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t border-white/10 bg-black/60 backdrop-blur px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-white/50 uppercase tracking-wide">{t("cart.total")}</p>
                    <p className="text-lg font-semibold text-amber-300">{formatMoney(cartTotal, "XOF")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="border-white/15 text-white/80 hover:bg-white/10"
                      onClick={() => setCart([])}
                    >
                      Clear
                    </Button>
                    <Button
                      className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold"
                      disabled={orderMutation.isPending}
                      onClick={handlePlaceOrder}
                    >
                      {orderMutation.isPending ? "Placing…" : t("cart.checkout")}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={vaultOpen} onOpenChange={setVaultOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className="bg-[#0f1419]/95 backdrop-blur-xl border-l border-emerald-900/20 text-white"
          style={{ zIndex: "var(--layer-sheet)" }}
        >
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              {vaultPane === "vault" ? (
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
              ) : (
                <Wallet className="h-5 w-5 text-amber-300" />
              )}
              {vaultPane === "vault" ? t("vault.title") : t("wallet.title")}
            </SheetTitle>
          </SheetHeader>

	          {!session.isAuthenticated || session.isGuest ? (
	            <div className="mt-6 space-y-3">
	              <p className="text-sm text-white/80">{t("vault.signInToAccess")}</p>
	              <div className="flex gap-2">
	                <Button
	                  className="flex-1 bg-white/10 hover:bg-white/15 text-white"
	                  onClick={() => navigate(`/login?next=${encodeURIComponent("/?panel=wallet&topup=1")}`)}
	                >
	                  {t("common.signIn")}
	                </Button>
	                <Button
	                  variant="outline"
	                  className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
	                  onClick={() => navigate(`/register?next=${encodeURIComponent("/?panel=wallet&topup=1")}`)}
	                >
	                  {t("common.createAccount")}
	                </Button>
	              </div>
	            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-center">
                <div className="flex w-full max-w-sm items-center rounded-full border border-white/10 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => setVaultPane("wallet")}
                    className={`flex-1 rounded-full px-3 py-2 text-[11px] font-semibold transition-colors ${
                      vaultPane === "wallet" ? "bg-amber-500/20 text-amber-200" : "text-white/70 hover:text-white"
                    }`}
                  >
                    {t("wallet.title")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVaultPane("vault")}
                    className={`flex-1 rounded-full px-3 py-2 text-[11px] font-semibold transition-colors ${
                      vaultPane === "vault" ? "bg-emerald-500/20 text-emerald-200" : "text-white/70 hover:text-white"
                    }`}
                  >
                    {t("vault.title")}
                  </button>
                </div>
              </div>

              {vaultPane === "wallet" ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
	                    <div className="flex items-center justify-between gap-3">
	                      <p className="text-sm font-semibold text-white">{t("wallet.title")}</p>
	                      <p className="text-sm font-semibold text-amber-300">
	                        {walletSummaryLoading ? "..." : formatMoney(Number(walletSummary?.wallet?.balance || 0), "XOF")}
	                      </p>
	                    </div>

	                    <WalletDepositModal
	                      label={t("wallet.deposit")}
	                      next="/?panel=wallet"
	                      autoOpen={walletTopupAutoOpen}
	                      buttonClassName="w-full bg-amber-500 hover:bg-amber-600 text-black"
	                    />

	                    <div className="flex flex-wrap gap-2">
	                      <Button
	                        variant="outline"
                        className="border-white/15 text-white/80 hover:bg-white/10"
                        onClick={() => setBdoPurchaseOpen(true)}
                      >
                        {t("vault.buyUnits")}
                      </Button>
                      <Button
                        variant="outline"
                        className="border-white/15 text-white/80 hover:bg-white/10"
                        onClick={() => setBdoSecondaryOpen(true)}
                      >
                        {t("secondaryMarket.title")}
                      </Button>
                    </div>
                    <p className="text-[11px] text-white/50">{t("vault.pricingAtPurchase")}</p>
                  </div>

                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="text-[11px] text-white/60 uppercase tracking-wider">{t("vault.totalGold")}</p>
                    <p className="text-xl font-semibold text-emerald-200">
                      {vaultLoading ? "..." : `${Number(vaultData?.totalGrams || 0)} g`}
                    </p>
                    <p className="mt-1 text-[12px] text-white/60">{t("vault.description")}</p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Recent activity</p>
                      <p className="text-[11px] text-white/50">{walletTransactions.length ? `${walletTransactions.length}` : ""}</p>
                    </div>
	                    {walletTransactions.length ? (
	                      <ScrollArea className="h-[32vh] pr-2">
	                        <div className="space-y-2">
	                          {walletTransactions.map((tx: any) => {
	                            const direction = String(tx?.direction || "").toLowerCase();
	                            const isCredit = direction === "credit";
	                            const createdAt = tx?.createdAt ? new Date(String(tx.createdAt)) : null;
	                            const amount = Number(tx?.amount || 0);
	                            const currencyCode = walletSummary?.wallet?.currency || "XOF";
	                            return (
	                              <div
	                                key={tx?.id ?? `${tx?.entryType || tx?.type}-${tx?.createdAt}`}
	                                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 flex items-center justify-between gap-3"
	                              >
	                                <div className="min-w-0">
	                                  <p className="text-[12px] font-semibold text-white truncate">
	                                    {String(tx?.entryType || tx?.type || "transaction").replace(/_/g, " ")}
	                                  </p>
	                                  <p className="text-[10px] text-white/50 truncate">
	                                    {createdAt && !Number.isNaN(createdAt.getTime())
	                                      ? createdAt.toLocaleString()
                                      : ""}
                                  </p>
                                </div>
                                <p className={`text-[12px] font-semibold ${isCredit ? "text-emerald-300" : "text-rose-300"}`}>
                                  {isCredit ? "+" : "-"}{formatMoney(amount, currencyCode)}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="text-[12px] text-white/60">No transactions yet.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="text-[11px] text-white/60 uppercase tracking-wider">{t("vault.totalGold")}</p>
                    <p className="text-2xl font-semibold text-emerald-300">
                      {vaultLoading ? "..." : `${Number(vaultData?.totalGrams || 0)} g`}
                    </p>
                    <p className="mt-1 text-[12px] text-white/60">{t("vault.description")}</p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-sm font-semibold text-white mb-2">{t("vault.units")}</p>
                    {!vaultLoading && (!vaultData?.units || vaultData.units.length === 0) ? (
                      <p className="text-[12px] text-white/60">{t("vault.noUnits")}</p>
                    ) : (
                      <ScrollArea className="h-[55vh] pr-2">
                        <div className="space-y-2">
                          {(vaultData?.units || []).map((unit: any) => (
                            <div key={unit.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">
                                    {Number(unit.unitSizeGrams || 0)} g
                                  </p>
                                  <p className="text-[11px] text-white/60">
                                    {t("vault.status")}: {String(unit.status || "stored").replace(/_/g, " ")}
                                  </p>
                                  <p className="text-[10px] text-white/45 truncate">ID: {String(unit.id)}</p>
                                </div>
                                <Badge variant="outline" className="border-emerald-500/30 text-emerald-300 text-[10px]">
                                  {unit.isLocked ? t("vault.locked") : t("vault.available")}
                                </Badge>
                              </div>
                              {unit.lockupEndDate ? (
                                <p className="mt-2 text-[11px] text-white/50">
                                  {t("vault.lockupEnds")}: {new Date(unit.lockupEndDate).toLocaleDateString()}
                                </p>
                              ) : null}

                              {String(unit.status) === "stored" ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-emerald-500 hover:bg-emerald-600 text-black"
                                    disabled={unit.isLocked || bdoRequestDeliveryMutation.isPending}
                                    onClick={() => bdoRequestDeliveryMutation.mutate(Number(unit.id))}
                                  >
                                    {t("vault.requestDelivery")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-white/15 text-white/80 hover:bg-white/10"
                                    disabled={unit.isLocked || bdoAuthorizeResaleMutation.isPending}
                                    onClick={() => bdoAuthorizeResaleMutation.mutate(Number(unit.id))}
                                  >
                                    {t("vault.authorizeResale")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-white/15 text-white/80 hover:bg-white/10"
                                    disabled={unit.isLocked || bdoCreateListingMutation.isPending}
                                    onClick={() => bdoCreateListingMutation.mutate(Number(unit.id))}
                                  >
                                    {t("vault.listForResale")}
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={bdoPurchaseOpen} onOpenChange={setBdoPurchaseOpen}>
        <DialogContent className="bg-[#0b1117] border border-emerald-500/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">{t("vault.buyUnits")}</DialogTitle>
            <DialogDescription className="text-white/60">{t("vault.buyUnitsDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[11px] text-white/60">{t("vault.unitSize")}</Label>
              <div className="flex flex-wrap gap-2">
                {(Array.isArray(bdoUnitDefs) ? bdoUnitDefs : []).map((d: any) => (
                  <Button
                    key={d.id ?? d.unitSizeGrams}
                    type="button"
                    size="sm"
                    variant={Number(d.unitSizeGrams) === bdoPurchaseUnitSize ? "default" : "outline"}
                    className={
                      Number(d.unitSizeGrams) === bdoPurchaseUnitSize
                        ? "bg-emerald-500 hover:bg-emerald-600 text-black"
                        : "border-white/15 text-white/80 hover:bg-white/10"
                    }
                    onClick={() => setBdoPurchaseUnitSize(Number(d.unitSizeGrams))}
                  >
                    {Number(d.unitSizeGrams)}g
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] text-white/60">{t("vault.deliveryChoice")}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={!bdoPurchaseDeliveryNow ? "default" : "outline"}
                  className={
                    !bdoPurchaseDeliveryNow ? "bg-white/10 hover:bg-white/15 text-white" : "border-white/15 text-white/80 hover:bg-white/10"
                  }
                  onClick={() => setBdoPurchaseDeliveryNow(false)}
                >
                  {t("vault.storeInVault")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={bdoPurchaseDeliveryNow ? "default" : "outline"}
                  className={
                    bdoPurchaseDeliveryNow ? "bg-emerald-500 hover:bg-emerald-600 text-black" : "border-white/15 text-white/80 hover:bg-white/10"
                  }
                  onClick={() => setBdoPurchaseDeliveryNow(true)}
                >
                  {t("vault.deliveryNow")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] text-white/60">{t("vault.lockupLabel")}</Label>
              <Input
                type="date"
                value={bdoPurchaseLockupEndDate}
                onChange={(e) => setBdoPurchaseLockupEndDate(e.target.value)}
                className="bg-black/40 border-white/10 text-white"
              />
              <p className="text-[11px] text-white/50">{t("vault.lockupHelp")}</p>
            </div>

            <Button
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
              disabled={bdoPurchaseMutation.isPending || !bdoPurchaseUnitSize}
              onClick={() => bdoPurchaseMutation.mutate()}
            >
              {t("vault.confirmPurchase")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bdoSecondaryOpen} onOpenChange={setBdoSecondaryOpen}>
        <DialogContent className="bg-[#0b1117] border border-amber-500/20 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{t("secondaryMarket.title")}</DialogTitle>
            <DialogDescription className="text-white/60">{t("secondaryMarket.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {bdoListingsLoading ? (
              <p className="text-sm text-white/60">{t("common.loading")}</p>
            ) : bdoListingsError ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-sm text-white/80">{t("secondaryMarket.restricted")}</p>
                <p className="mt-2 text-[12px] text-white/60">
                  {String((bdoListingsError as any)?.message || "").trim()}
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[50vh] pr-2">
                <div className="space-y-2">
                  {(bdoListingsData?.listings || []).length === 0 ? (
                    <p className="text-sm text-white/60">{t("secondaryMarket.empty")}</p>
                  ) : (
                    (bdoListingsData?.listings || []).map((listing: any) => (
                      <div key={listing.id} className="rounded-lg border border-white/10 bg-black/30 p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {t("secondaryMarket.listing")} #{listing.id}
                          </p>
                          <p className="text-[11px] text-white/60 truncate">
                            {t("secondaryMarket.visibleToConfirmed")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="bg-amber-500 hover:bg-amber-600 text-black"
                          disabled={bdoBuyListingMutation.isPending}
                          onClick={() => bdoBuyListingMutation.mutate(Number(listing.id))}
                        >
                          {t("secondaryMarket.buy")}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={wholesaleApplyOpen} onOpenChange={setWholesaleApplyOpen}>
        <DialogContent className="bg-[#0b1117] border border-orange-500/20 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{t("wholesale.apply.dialogTitle")}</DialogTitle>
            <DialogDescription className="text-white/60">
              {t("wholesale.apply.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!session.isAuthenticated && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm text-white/80 font-medium">{t("wholesale.apply.step1.title")}</p>
                <p className="text-[12px] text-white/60 mt-1">{t("wholesale.apply.step1.description")}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    className="flex-1 bg-white/10 hover:bg-white/15 text-white"
                    onClick={() => {
                      setWholesaleApplyOpen(false);
                      navigate("/login");
                    }}
                  >
                    {t("common.signIn")}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
                    onClick={() => {
                      setWholesaleApplyOpen(false);
                      navigate("/register");
                    }}
                  >
                    {t("common.createAccount")}
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-sm text-white/80 font-medium">{t("wholesale.apply.step2.title")}</p>
              <p className="text-[12px] text-white/60 mt-1">{t("wholesale.apply.step2.description")}</p>
              <div className="mt-3">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="block w-full text-[12px] text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:hover:bg-white/15"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    const name = file?.name || "";
                    setWholesaleLicenseFileName(name);
                    safeLocalStorageSet("wholesale_license_file", name);
                  }}
                />
                {wholesaleLicenseFileName && (
                  <p className="text-[12px] text-white/60 mt-2">
                    {t("wholesale.apply.selectedFile").replace("{file}", wholesaleLicenseFileName)}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-sm text-white/80 font-medium">{t("wholesale.apply.step3.title")}</p>
              <p className="text-[12px] text-white/60 mt-1">{t("wholesale.apply.step3.description")}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black font-semibold"
                  onClick={() => requestWholesaleAccess.mutate()}
                  disabled={!wholesaleLicenseFileName || isWholesaleAccessPending || isWholesaleAuthorized || requestWholesaleAccess.isPending}
                >
                  {requestWholesaleAccess.isPending
                    ? t("common.submitting")
                    : isWholesaleAuthorized
                      ? t("wholesale.apply.status.approved")
                      : isWholesaleAccessPending
                        ? t("wholesale.preview.requestPending")
                        : t("wholesale.apply.submitApplication")}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
                  onClick={() => setWholesaleApplyOpen(false)}
                >
                  {t("common.notNow")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={customEquipmentOpen} onOpenChange={setCustomEquipmentOpen}>
        <DialogContent className="bg-[#0b1117] border border-sky-500/20 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Request Custom Equipment</DialogTitle>
            <DialogDescription className="text-white/60">
              Submit a build/request brief. Our team will contact you.
            </DialogDescription>
          </DialogHeader>

          <ChatFormWizard<MachineryRequestAnswers>
            title="Request custom equipment"
            description="Answer a few questions. You can save and continue later."
            storageKey="machinery_custom_request_chat_v1"
            initialAnswers={{
              category: "extraction",
              conditionPreference: "new",
              name: "",
              targetCapacity: "",
              powerSource: "Diesel",
              budgetMin: "",
              budgetMax: "",
              budgetCurrency: "USD",
              deliveryCountry: "CI",
              deliveryCityRegion: "",
              deliveryAddress: "",
              timelineNeeded: "",
              notes: "",
            }}
            steps={machineryRequestSteps}
            submitLabel="Submit request"
            onExit={() => setCustomEquipmentOpen(false)}
            onSubmit={async ({ answers }) => {
              const key = "machinery_custom_requests";
              const existing = JSON.parse(localStorage.getItem(key) || "[]");
              existing.unshift({
                id: `custom-${Date.now()}`,
                status: "open",
                createdAt: new Date().toISOString(),
                ...answers,
              });
              safeLocalStorageSet(key, JSON.stringify(existing));
              setCustomEquipmentOpen(false);
            }}
          />
          {/*
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Category</Label>
                <select
                  className="h-10 w-full rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                  value={customEquipmentForm.category}
                  onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, category: e.target.value }))}
                >
                  <option value="extraction">Extraction</option>
                  <option value="processing">Processing</option>
                  <option value="support">Support</option>
                  <option value="mobility">Mobility</option>
                  <option value="spare_parts">Spare Parts</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Condition preference</Label>
                <select
                  className="h-10 w-full rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                  value={customEquipmentForm.conditionPreference}
                  onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, conditionPreference: e.target.value }))}
                >
                  <option value="new">New</option>
                  <option value="refurbished">Refurb</option>
                  <option value="used">Used</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-white/70 text-xs">Equipment name / type</Label>
              <Input
                value={customEquipmentForm.name}
                onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Trommel 2m, Crusher jaw plate…"
                className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Target capacity</Label>
                <Input
                  value={customEquipmentForm.targetCapacity}
                  onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, targetCapacity: e.target.value }))}
                  placeholder="e.g., 20 t/h, 250 kVA…"
                  className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Power source</Label>
                <select
                  className="h-10 w-full rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                  value={customEquipmentForm.powerSource}
                  onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, powerSource: e.target.value }))}
                >
                  <option value="Diesel">Diesel</option>
                  <option value="Electric">Electric</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Budget min</Label>
                <Input
                  value={customEquipmentForm.budgetMin}
                  onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, budgetMin: e.target.value }))}
                  placeholder="0"
                  className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Budget max</Label>
                <Input
                  value={customEquipmentForm.budgetMax}
                  onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, budgetMax: e.target.value }))}
                  placeholder="0"
                  className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Currency</Label>
                <select
                  className="h-10 w-full rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                  value={customEquipmentForm.budgetCurrency}
                  onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, budgetCurrency: e.target.value }))}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="XOF">XOF</option>
                  <option value="AED">AED</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Delivery location</Label>
                <Input
                  value={customEquipmentForm.deliveryLocation}
                  onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, deliveryLocation: e.target.value }))}
                  className="bg-black/30 border-white/10 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">City / region</Label>
                <Input
                  value={customEquipmentForm.deliveryRegion}
                  onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, deliveryRegion: e.target.value }))}
                  placeholder="Abidjan"
                  className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-white/70 text-xs">Timeline needed</Label>
              <Input
                value={customEquipmentForm.timelineNeeded}
                onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, timelineNeeded: e.target.value }))}
                placeholder="e.g., 4 weeks, 2026-01-15"
                className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-white/70 text-xs">Notes (optional)</Label>
              <textarea
                value={customEquipmentForm.notes}
                onChange={(e) => setCustomEquipmentForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full min-h-[88px] rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] p-2 outline-none"
                placeholder="Add any specs or constraints…"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-black font-semibold"
                onClick={() => {
                  const required = [
                    customEquipmentForm.category,
                    customEquipmentForm.name,
                    customEquipmentForm.targetCapacity,
                    customEquipmentForm.powerSource,
                    customEquipmentForm.conditionPreference,
                    customEquipmentForm.budgetMin,
                    customEquipmentForm.budgetMax,
                    customEquipmentForm.deliveryLocation,
                    customEquipmentForm.deliveryRegion,
                    customEquipmentForm.timelineNeeded,
                  ];
                  if (required.some((v) => !String(v || "").trim())) {
                    toast({ title: "Missing fields", description: "Please fill all required fields.", variant: "destructive" });
                    return;
                  }

                  const key = "machinery_custom_requests";
                  const existing = JSON.parse(localStorage.getItem(key) || "[]");
                  existing.unshift({
                    id: `custom-${Date.now()}`,
                    status: "open",
                    createdAt: new Date().toISOString(),
                    ...customEquipmentForm,
                  });
                  safeLocalStorageSet(key, JSON.stringify(existing));
                  toast({ title: "Request submitted", description: "Our team will contact you." });
                  setCustomEquipmentOpen(false);
                }}
              >
                Submit Request
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
                onClick={() => setCustomEquipmentOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
          */}
        </DialogContent>
      </Dialog>

      <Dialog open={mineListingOpen} onOpenChange={setMineListingOpen}>
        <DialogContent className="bg-[#0b1117] border border-emerald-500/20 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">{t("cadastre.claimTitle")}</DialogTitle>
            <DialogDescription className="text-white/60">
              {t("cadastre.claimDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[12px] text-emerald-100">
              {t("cadastre.claimRule")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input
                value={cadastreSearch}
                onChange={(e) => setCadastreSearch(e.target.value)}
                placeholder={t("cadastre.searchPlaceholder")}
                className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
              />
              <select
                className="h-10 w-full rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                value={cadastreCountry}
                onChange={(e) => setCadastreCountry(e.target.value)}
              >
                <option value="all">{t("cadastre.allCountries")}</option>
                {cadastreCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <ScrollArea className="max-h-[38vh] pr-2">
              <div className="space-y-2">
                {cadastrePermitResults.length ? (
                  cadastrePermitResults.slice(0, 40).map((permit) => (
                    <button
                      key={permit.permitId}
                      type="button"
                      onClick={() => setCadastreSelectedPermit(permit)}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        cadastreSelectedPermit?.permitId === permit.permitId
                          ? "border-emerald-500/40 bg-emerald-500/10"
                          : "border-white/10 bg-white/5 hover:border-emerald-500/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm text-white font-semibold">{permit.permitId}</p>
                          <p className="text-[11px] text-white/60">{permit.holderName}</p>
                        </div>
                        <Badge className="text-[10px] bg-emerald-500/15 text-emerald-200 border-emerald-400/30">
                          {permit.permitStatus}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-white/60">
                        {permit.country} • {permit.region} • {permit.permitType}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-[12px] text-white/60">{t("cadastre.noResults")}</div>
                )}
              </div>
            </ScrollArea>

            {cadastreSelectedPermit ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                <div>
                  <p className="text-[11px] text-white/60 uppercase tracking-wider">{t("cadastre.selectedPermit")}</p>
                  <p className="text-sm text-white font-semibold">{cadastreSelectedPermit.permitId}</p>
                  <p className="text-[11px] text-white/60">
                    {cadastreSelectedPermit.holderName} • {cadastreSelectedPermit.permitType} • {cadastreSelectedPermit.permitStatus}
                  </p>
                  <p className="text-[11px] text-white/60">
                    {cadastreSelectedPermit.country} • {cadastreSelectedPermit.region} • {cadastreSelectedPermit.commodity}
                  </p>
                  {getCadastreSourceForCountry(cadastreSelectedPermit.country)?.sourceUrl ? (
                    <a
                      href={getCadastreSourceForCountry(cadastreSelectedPermit.country)!.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-emerald-300 hover:text-emerald-200"
                    >
                      {t("cadastre.sourceLink")}
                    </a>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">{t("cadastre.proofLabel")}</Label>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="block w-full text-[12px] text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white file:hover:bg-white/15"
                    onChange={(e) => {
                      const name = e.target.files?.[0]?.name || "";
                      setCadastreProofFileName(name);
                    }}
                  />
                  {cadastreProofFileName ? (
                    <p className="text-[11px] text-white/60">{t("cadastre.proofSelected").replace("{file}", cadastreProofFileName)}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">{t("cadastre.claimNote")}</Label>
                  <textarea
                    value={cadastreClaimNote}
                    onChange={(e) => setCadastreClaimNote(e.target.value)}
                    className="w-full min-h-[80px] rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] p-2 outline-none"
                    placeholder={t("cadastre.claimNotePlaceholder")}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[12px] text-white/60">
                {t("cadastre.selectPrompt")}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-semibold"
                onClick={() => {
                  if (!cadastreSelectedPermit) {
                    toast({ title: t("cadastre.selectPrompt"), variant: "destructive" });
                    return;
                  }
                  if (!cadastreProofFileName) {
                    toast({ title: t("cadastre.proofRequired"), variant: "destructive" });
                    return;
                  }
                  const next = [
                    {
                      id: `cadastre-claim-${Date.now()}`,
                      permitId: cadastreSelectedPermit.permitId,
                      country: cadastreSelectedPermit.country,
                      status: "pending",
                      createdAt: new Date().toISOString(),
                      proofFileName: cadastreProofFileName,
                      note: cadastreClaimNote,
                    },
                    ...cadastreClaims,
                  ];
                  setCadastreClaims(next);
                  safeLocalStorageSet("cadastre_claims_v1", JSON.stringify(next));
                  toast({ title: t("cadastre.claimSubmitted"), description: t("cadastre.claimSubmittedDesc") });
                  setMineListingOpen(false);
                }}
              >
                {t("cadastre.claimSubmit")}
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
                onClick={() => setMineListingOpen(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
          {/*
          <ScrollArea className="max-h-[70vh] pr-3">
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-semibold text-white">Identity & legal</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Legal mine/company name</Label>
                    <Input
                      value={mineListingForm.legalName}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, legalName: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Registration number</Label>
                    <Input
                      value={mineListingForm.registrationNumber}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, registrationNumber: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Country</Label>
                    <Input
                      value={mineListingForm.country}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, country: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Region / locality</Label>
                    <Input
                      value={mineListingForm.region}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, region: e.target.value }))}
                      placeholder="e.g., Haut-Sassandra"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">GPS latitude</Label>
                    <Input
                      value={mineListingForm.lat}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, lat: e.target.value }))}
                      placeholder="6.8774"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">GPS longitude</Label>
                    <Input
                      value={mineListingForm.lng}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, lng: e.target.value }))}
                      placeholder="-6.4504"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">License type</Label>
                    <Input
                      value={mineListingForm.licenseType}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, licenseType: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">License number</Label>
                    <Input
                      value={mineListingForm.licenseNumber}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, licenseNumber: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">License issued date</Label>
                    <Input
                      value={mineListingForm.licenseIssuedDate}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, licenseIssuedDate: e.target.value }))}
                      placeholder="YYYY-MM-DD"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">License expiry date</Label>
                    <Input
                      value={mineListingForm.licenseExpiryDate}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, licenseExpiryDate: e.target.value }))}
                      placeholder="YYYY-MM-DD"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-white/70 text-xs">License holder name</Label>
                    <Input
                      value={mineListingForm.licenseHolderName}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, licenseHolderName: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-semibold text-white">Operations</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Mining method</Label>
                    <select
                      className="h-10 w-full rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                      value={mineListingForm.miningMethod}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, miningMethod: e.target.value }))}
                    >
                      <option value="artisanal">Artisanal</option>
                      <option value="semi-industrial">Semi-industrial</option>
                      <option value="industrial">Industrial</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Start of operations</Label>
                    <Input
                      value={mineListingForm.operationsStartDate}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, operationsStartDate: e.target.value }))}
                      placeholder="YYYY-MM-DD"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Workforce size</Label>
                    <Input
                      value={mineListingForm.workforceSize}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, workforceSize: e.target.value }))}
                      placeholder="e.g., 45"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Current equipment list</Label>
                    <Input
                      value={mineListingForm.equipmentList}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, equipmentList: e.target.value }))}
                      placeholder="e.g., Trommel, Generator…"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-semibold text-white">Production history</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Total extracted since start (kg)</Label>
                    <Input
                      value={mineListingForm.totalExtractedKg}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, totalExtractedKg: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Last 12 months (kg)</Label>
                    <Input
                      value={mineListingForm.last12MonthsKg}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, last12MonthsKg: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Last 3 months (kg)</Label>
                    <Input
                      value={mineListingForm.last3MonthsKg}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, last3MonthsKg: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Typical monthly output (kg/month)</Label>
                    <Input
                      value={mineListingForm.typicalMonthlyKg}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, typicalMonthlyKg: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-semibold text-white">Needs</p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">What capital is for</Label>
                    <Input
                      value={mineListingForm.capitalUse}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, capitalUse: e.target.value }))}
                      placeholder="equipment / processing / ops"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Amount needed (USD)</Label>
                    <Input
                      value={mineListingForm.amountNeededUsd}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, amountNeededUsd: e.target.value }))}
                      className="bg-black/30 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Timeline</Label>
                    <Input
                      value={mineListingForm.timeline}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, timeline: e.target.value }))}
                      placeholder="e.g., 8 weeks"
                      className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Preferred return model (label)</Label>
                    <select
                      className="h-10 w-full rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] px-2"
                      value={mineListingForm.preferredReturnModel}
                      onChange={(e) => setMineListingForm((p) => ({ ...p, preferredReturnModel: e.target.value }))}
                    >
                      <option value="Return per rotation">Return per rotation</option>
                      <option value="Production share">Production share</option>
                      <option value="Offtake-linked premium">Offtake-linked premium</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Label className="text-white/70 text-xs">Notes</Label>
                  <textarea
                    value={mineListingForm.notes}
                    onChange={(e) => setMineListingForm((p) => ({ ...p, notes: e.target.value }))}
                    className="w-full min-h-[88px] rounded-md bg-black/30 border border-white/10 text-white/80 text-[12px] p-2 outline-none"
                    placeholder="Add context or documentation notes…"
                  />
                </div>
                <p className="text-[11px] text-white/45 mt-3">
                  Documents upload (license, registration, site photos, production proof) will be requested after submission.
                </p>
              </div>
            </div>
          </ScrollArea>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black font-semibold"
              onClick={() => {
                const required = [
                  mineListingForm.legalName,
                  mineListingForm.country,
                  mineListingForm.region,
                  mineListingForm.lat,
                  mineListingForm.lng,
                  mineListingForm.licenseType,
                  mineListingForm.licenseNumber,
                  mineListingForm.licenseIssuedDate,
                  mineListingForm.licenseExpiryDate,
                  mineListingForm.licenseHolderName,
                  mineListingForm.operationsStartDate,
                  mineListingForm.totalExtractedKg,
                  mineListingForm.last12MonthsKg,
                  mineListingForm.typicalMonthlyKg,
                  mineListingForm.amountNeededUsd,
                  mineListingForm.timeline,
                ];
                if (required.some((v) => !String(v || "").trim())) {
                  toast({ title: "Missing fields", description: "Please fill all required fields.", variant: "destructive" });
                  return;
                }
                const key = "mine_owner_submissions";
                const existing = JSON.parse(localStorage.getItem(key) || "[]");
                existing.unshift({
                  id: `mine-sub-${Date.now()}`,
                  status: "submitted",
                  createdAt: new Date().toISOString(),
                  ...mineListingForm,
                });
                safeLocalStorageSet(key, JSON.stringify(existing));
                toast({ title: "Mine submitted", description: "Submission received. Verification will follow." });
                setMineListingOpen(false);
              }}
            >
              Submit Mine
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-white/15 text-white/80 hover:bg-white/10"
              onClick={() => setMineListingOpen(false)}
            >
              Cancel
            </Button>
          </div>
          */}
        </DialogContent>
      </Dialog>

      <MobileBottomNav
        activeKey={navActiveKey}
        items={[
          {
            key: "browse",
            label: t("common.browse"),
            icon: <Store className="h-4 w-4" />,
            onPress: () => {
              setVaultOpen(false);
              setCartOpen(false);
              setMapOverlayOpen(false);
              setRetailMode();
            },
          },
          ...(mapEnabled
            ? [
                {
                  key: "map",
                  label: t("nav.map"),
                  icon: <MapPin className="h-4 w-4" />,
                  onPress: () => {
                    setVaultOpen(false);
                    setCartOpen(false);
                    setMapOverlayOpen(true);
                  },
                },
              ]
            : []),
          {
            key: "wallet",
            label: t("nav.wallet"),
            icon: <Wallet className="h-4 w-4" />,
            primary: true,
            onPress: () => {
              setVaultPane("wallet");
              setCartOpen(false);
              setVaultOpen(true);
            },
          },
          {
            key: "vault",
            label: t("nav.vault"),
            icon: <ShieldCheck className="h-4 w-4" />,
            onPress: () => {
              setVaultPane("vault");
              setCartOpen(false);
              setVaultOpen(true);
            },
          },
        ]}
      />
    </div>
  );
}


