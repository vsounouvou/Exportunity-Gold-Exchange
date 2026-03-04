import { Router } from "express";
import { db } from "@db";
import { 
  producers, 
  producerCategories, 
  producerProducts,
  producerConversations,
  producerMessages,
  eceUsers,
  eceSessions,
  sellers,
  sellerProducts,
  productCategories,
  marketplaceOrders,
  marketplaceOrderItems,
  partnerJewellers,
  sellerWalletTransactions,
  buyerWallets,
  buyerWalletTransactions,
  geoContinents,
  geoCountries,
  geoRegions,
  geoCities,
  geoDistricts,
  geoNeighborhoods,
  marketAccessRequests,
  sourcingRequests,
  users,
  tenants,
  auditLogs,
  stampedGoldItems,
  stampedGoldSkus,
  mapMarkerStyles,
  productImages,
  imageAssets,
  generatedImages
} from "@db/schema";
import { eq, desc, and, sql, asc, ilike, or, gte, lte, inArray, isNull } from "drizzle-orm";
import OpenAI from "openai";
import { nanoid } from "nanoid";
import Anthropic from "@anthropic-ai/sdk";
import { assertAiEnabled } from "../lib/ai-consent";
import { BDO_POLICY_SNIPPET, sanitizeBdoText } from "../lib/bdo/policy";
import { isChairmanAssistantUser } from "./utils/auth";
import { demoCompanyName, demoPersonName, isDemoModeRequest } from "./utils/demo-mode";
import { getSetting } from "../lib/settings";
import { getFxSnapshot, getUsdConversionRateForCurrency, tenantFxScopeFromRequest } from "../lib/fx";
import { generateAndStoreImage } from "../lib/imageGen/service";
import { buildProductPrompt, getProductPrimaryAssetKey, inferProductImagePreset as inferProductImagePresetByCategory } from "../lib/imageGen/productPrompt";
import { buildAnglePreset, ensureProductSlots, syncProductImagesArray } from "../lib/imageGen/productImages";
import { getOrCreateWalletAccount } from "../lib/wallet/wallet";
import { payMarketplaceOrderWithWallet } from "../lib/wallet/purchases";
import { DEFAULT_MAP_MARKER_STYLES, normalizeMarkerStyleKey } from "../lib/marketplace/mapMarkers";

const router = Router();

function requireTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant) {
    res.status(500).json({ message: "Tenant not resolved" });
    return null;
  }
  return tenant;
}

async function resolveMarketplaceDataTenant(requestTenant: any) {
  if (!requestTenant) return requestTenant;

  // Zone uses the same live retail catalog as Exportunity unless explicitly overridden.
  if (String(requestTenant.key || "").trim().toLowerCase() !== "zone") {
    return requestTenant;
  }

  const aliasKey = String(process.env.ZONE_MARKETPLACE_SOURCE_TENANT || "exportunity")
    .trim()
    .toLowerCase();

  if (!aliasKey || aliasKey === "zone") {
    return requestTenant;
  }

  const aliased = await db.query.tenants.findFirst({
    where: eq(tenants.key, aliasKey as any),
  });

  return aliased || requestTenant;
}

function buildWhere(conditions: Array<any | undefined>) {
  const filtered = conditions.filter(Boolean) as any[];
  if (!filtered.length) return undefined;
  if (filtered.length === 1) return filtered[0];
  return and(...filtered);
}

type MarkerStyleRecord = {
  key: string;
  label: string;
  iconType: string;
  iconValue: string;
  color: string;
  size: number;
  zIndex: number;
  isActive: boolean;
};

function defaultShopMarkerStyle(): MarkerStyleRecord {
  const fallback = DEFAULT_MAP_MARKER_STYLES.find((s) => s.key === "shop_default") || DEFAULT_MAP_MARKER_STYLES[0];
  return {
    key: fallback.key,
    label: fallback.label,
    iconType: fallback.iconType,
    iconValue: fallback.iconValue,
    color: fallback.color,
    size: fallback.size,
    zIndex: fallback.zIndex,
    isActive: fallback.isActive,
  };
}

function toMarkerStyleRecord(row: any): MarkerStyleRecord | null {
  if (!row) return null;
  const key = normalizeMarkerStyleKey(row.key);
  if (!key) return null;
  return {
    key,
    label: String(row.label || key),
    iconType: String(row.iconType || "emoji"),
    iconValue: String(row.iconValue || "🏪"),
    color: String(row.color || "#111827"),
    size: Number(row.size || 28),
    zIndex: Number(row.zIndex || 10),
    isActive: row.isActive !== false,
  };
}

async function loadActiveMarkerStyles(tenantId: number) {
  const rows = await db
    .select()
    .from(mapMarkerStyles)
    .where(and(eq(mapMarkerStyles.tenantId, tenantId), eq(mapMarkerStyles.isActive, true)))
    .orderBy(asc(mapMarkerStyles.zIndex), asc(mapMarkerStyles.key));

  const byKey = new Map<string, MarkerStyleRecord>();
  for (const row of rows) {
    const style = toMarkerStyleRecord(row);
    if (!style) continue;
    byKey.set(style.key, style);
  }

  const defaultStyle = byKey.get("shop_default") || defaultShopMarkerStyle();
  if (!byKey.has(defaultStyle.key)) byKey.set(defaultStyle.key, defaultStyle);
  if (!byKey.has("shop_default")) byKey.set("shop_default", defaultStyle);

  return {
    byKey,
    rows: Array.from(byKey.values()),
    defaultStyle: byKey.get("shop_default") || defaultStyle,
  };
}

const SUPPORTED_LANGUAGES = ["en", "fr", "ar"] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function normalizeRequestLanguage(value: unknown): SupportedLanguage | null {
  const lang = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!lang) return null;
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) return lang as SupportedLanguage;
  const base = lang.split("-")[0];
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(base)) return base as SupportedLanguage;
  return null;
}

function parseAcceptLanguageHeader(value: unknown): SupportedLanguage | null {
  const raw = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
  if (!raw) return null;

  const parts = raw
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter(Boolean) as string[];

  for (const part of parts) {
    const normalized = normalizeRequestLanguage(part);
    if (normalized) return normalized;
  }

  return null;
}

function getRequestLanguage(req: any): SupportedLanguage {
  const fromHeader =
    normalizeRequestLanguage(req.headers?.["x-ece-lang"]) ||
    normalizeRequestLanguage(req.headers?.["x-language"]) ||
    normalizeRequestLanguage(req.headers?.["x-lang"]);
  if (fromHeader) return fromHeader;

  const fromQuery = normalizeRequestLanguage(req.query?.lang);
  if (fromQuery) return fromQuery;

  const fromAccept = parseAcceptLanguageHeader(req.headers?.["accept-language"]);
  if (fromAccept) return fromAccept;

  return "en";
}

function localizeSellerProduct<T extends Record<string, any>>(product: T, lang: SupportedLanguage): T {
  if (!product || typeof product !== "object") return product;

  const attrs = (product as any).attributes as any;
  const i18n = attrs?.i18n ?? attrs?.translations;
  const preferred = i18n?.[lang];
  const fallbackEn = i18n?.en;
  if ((!preferred || typeof preferred !== "object") && (!fallbackEn || typeof fallbackEn !== "object")) return product;

  const pickString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const pickLocalized = (field: string, rawValue: unknown) =>
    pickString(preferred?.[field]) ?? pickString(fallbackEn?.[field]) ?? rawValue;

  const name = pickLocalized("name", (product as any).name);
  const shortDescription = pickLocalized("shortDescription", (product as any).shortDescription);
  const description = pickLocalized("description", (product as any).description);

  let tags = (product as any).tags;
  if (Array.isArray(preferred?.tags)) tags = preferred.tags;
  else if (Array.isArray(fallbackEn?.tags)) tags = fallbackEn.tags;
  else if (pickString(preferred?.tags) != null) tags = pickString(preferred?.tags);
  else if (pickString(fallbackEn?.tags) != null) tags = pickString(fallbackEn?.tags);

  return { ...(product as any), name, shortDescription, description, tags };
}

function isGoldTenantKey(key: string | undefined) {
  return key === "bdo" || key === "bourse";
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

async function isMapShowJewelersEnabled(tenantKey: string) {
  const isProd = String(process.env.NODE_ENV || "")
    .trim()
    .toLowerCase() === "production";
  const envDefault = isProd ? true : true;
  const envValue = parseBooleanEnv(process.env.FEATURE_MAP_SHOW_JEWELERS, envDefault);

  const override = await getSetting<any>(`tenant:${tenantKey}`, "FEATURE_MAP_SHOW_JEWELERS", undefined);
  if (typeof override === "boolean") return override;
  if (override && typeof override === "object" && typeof override.enabled === "boolean") return override.enabled;
  return envValue;
}

function inferAutoImagePreset(input: {
  tenantKey: string;
  categorySlug: string;
  categoryName?: string | null;
  productName?: string | null;
  shortDescription?: string | null;
  description?: string | null;
}) {
  return inferProductImagePresetByCategory({
    tenantKey: input.tenantKey,
    categorySlug: input.categorySlug,
    categoryName: input.categoryName,
    productName: input.productName,
    shortDescription: input.shortDescription,
    description: input.description,
  });
}

function defaultAutoImageCount(preset: "gold" | "jewelry" | "produce" | "generic") {
  if (preset === "jewelry") return 5;
  if (preset === "gold") return 4;
  if (preset === "produce") return 3;
  return 3;
}

function getRequestOrigin(req: any): string | null {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    ?.trim();
  const forwardedHost = String(req.headers?.["x-forwarded-host"] || "")
    .split(",")[0]
    ?.trim();

  const proto = forwardedProto || req.protocol;
  const host = forwardedHost || req.get?.("host");
  if (!proto || !host) return null;
  return `${proto}://${host}`;
}

function toPublicUrl(req: any, url: string | null | undefined): string | null {
  if (!url) return null;
  const raw = String(url);
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith("/")) return raw;
  const origin = getRequestOrigin(req);
  return origin ? `${origin}${raw}` : raw;
}

function absolutizeImageArray(req: any, images: unknown) {
  if (!Array.isArray(images)) return images;
  return images.map((x) => {
    if (typeof x !== "string") return x;
    return toPublicUrl(req, x) ?? x;
  });
}

function pickFirstImageUrl(images: unknown): string | null {
  if (Array.isArray(images)) {
    const hit = images.find((x) => typeof x === "string" && x.trim());
    return typeof hit === "string" ? hit : null;
  }
  if (typeof images === "string" && images.trim()) {
    const raw = images.trim();
    try {
      const parsed = JSON.parse(raw);
      return pickFirstImageUrl(parsed);
    } catch {
      return raw;
    }
  }
  return null;
}

async function resolveProductCardImageFallbacks(
  req: any,
  input: { tenantId: number; tenantKey: string; products: Array<{ id: number; categorySlug?: string | null }> },
) {
  const products = input.products
    .map((p) => ({ id: Number(p.id), categorySlug: typeof p.categorySlug === "string" ? p.categorySlug : null }))
    .filter((p) => Number.isFinite(p.id) && p.id > 0);

  if (!products.length) return new Map<number, string>();

  const primaryAssetKeyByProductId = new Map<number, string>();
  for (const p of products) {
    const assetKey = getProductPrimaryAssetKey({
      tenantKey: input.tenantKey,
      categorySlug: p.categorySlug || "general",
      productId: p.id,
    });
    primaryAssetKeyByProductId.set(p.id, assetKey);
  }

  const productIds = products.map((p) => p.id);
  const slots = await db
    .select({ productId: productImages.productId, position: productImages.position, assetKey: productImages.assetKey })
    .from(productImages)
    .where(
      and(eq(productImages.tenantId, input.tenantId), inArray(productImages.productId, productIds as any), isNull(productImages.deletedAt)),
    )
    .orderBy(asc(productImages.productId), asc(productImages.position));

  const candidateKeys = new Set<string>();
  for (const key of primaryAssetKeyByProductId.values()) candidateKeys.add(String(key));
  for (const slot of slots) {
    if (slot?.assetKey) candidateKeys.add(String(slot.assetKey));
  }

  const assetKeys = Array.from(candidateKeys).filter(Boolean);
  if (!assetKeys.length) return new Map<number, string>();

  const assets = await db
    .select({
      assetKey: imageAssets.assetKey,
      activeImageId: imageAssets.activeImageId,
      updatedAt: imageAssets.updatedAt,
    })
    .from(imageAssets)
    .where(and(eq(imageAssets.namespace, "products"), eq(imageAssets.variant, "default"), inArray(imageAssets.assetKey, assetKeys)));

  const assetsByKey = new Map<string, (typeof assets)[number]>(assets.map((a) => [String(a.assetKey), a]));
  const activeIds = Array.from(new Set(assets.map((a) => a.activeImageId).filter(Boolean) as string[]));

  const activeImages = activeIds.length
    ? await db
        .select({ id: generatedImages.id, storedUrl: generatedImages.storedUrl })
        .from(generatedImages)
        .where(inArray(generatedImages.id, activeIds as any))
    : [];

  const activeById = new Map<string, (typeof activeImages)[number]>(activeImages.map((img) => [String(img.id), img]));

  const resolvedUrlByKey = new Map<string, string>();
  for (const [assetKey, asset] of assetsByKey.entries()) {
    const activeImageId = asset.activeImageId ? String(asset.activeImageId) : "";
    const storedUrl = activeImageId ? String(activeById.get(activeImageId)?.storedUrl || "") : "";
    if (!storedUrl) continue;
    const updatedAt = asset.updatedAt ? asset.updatedAt.getTime() : null;
    const withVersion = updatedAt ? `${storedUrl}?v=${encodeURIComponent(String(updatedAt))}` : storedUrl;
    resolvedUrlByKey.set(assetKey, toPublicUrl(req, withVersion) ?? withVersion);
  }

  const fallbackByProductId = new Map<number, string>();

  for (const [productId, primaryKey] of primaryAssetKeyByProductId.entries()) {
    const url = resolvedUrlByKey.get(String(primaryKey));
    if (url) fallbackByProductId.set(productId, url);
  }

  for (const slot of slots) {
    const productId = Number(slot.productId);
    if (!Number.isFinite(productId) || fallbackByProductId.has(productId)) continue;
    const url = resolvedUrlByKey.get(String(slot.assetKey || ""));
    if (!url) continue;
    fallbackByProductId.set(productId, url);
  }

  return fallbackByProductId;
}

const openai =
  process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const anthropicApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const anthropicBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const anthropicModel =
  process.env.AI_INTEGRATIONS_ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL_BALANCED ||
  "claude-sonnet-4-5";

const anthropic = anthropicApiKey
  ? new Anthropic({
      apiKey: anthropicApiKey,
      ...(anthropicBaseURL ? { baseURL: anthropicBaseURL } : {}),
    })
  : null;

async function createChatCompletionText(options: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  sanitize?: (text: string) => string;
}) {
  assertAiEnabled({
    what: "Call an AI model (Marketplace assistant)",
    why: "This generates assistant responses using an external AI provider.",
    forHowLong: "For this request only.",
    resources: ["External AI API calls", "Compute/network usage"],
  });

  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [{ role: "system", content: options.system }, ...options.messages],
        temperature: options.temperature ?? 0.6,
        max_tokens: options.maxTokens ?? 600,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      });

      const text = completion.choices[0]?.message?.content ?? "";
      return options.sanitize ? options.sanitize(text) : text;
    } catch (error) {
      if (!anthropic) throw error;
      // Fall through to Anthropic
    }
  }

  if (!anthropic) {
    throw new Error("No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
  }

  const system = options.json ? `${options.system}\n\nReturn ONLY valid JSON.` : options.system;
  const response = await anthropic.messages.create({
    model: anthropicModel,
    max_tokens: options.maxTokens ?? 600,
    temperature: options.temperature ?? 0.6,
    system,
    messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text =
    response.content
      ?.filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim() ?? ""

  return options.sanitize ? options.sanitize(text) : text;
}

function extractJsonCandidate(raw: string): string | null {
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

function parseJsonObjectLoose(raw: string): Record<string, unknown> | null {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeBuyerActionType(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeBuyerMatchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toIntOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function clampInt(value: unknown, opts: { min: number; max: number; fallback: number }): number {
  const n = toIntOrNull(value);
  if (n == null) return opts.fallback;
  return Math.max(opts.min, Math.min(opts.max, n));
}

type BuyerActionCandidate = { id: number; label: string };

function resolveBuyerActionProductId(
  hints: { productId?: unknown; productName?: unknown },
  candidates: BuyerActionCandidate[],
): number | null {
  const byId = toIntOrNull(hints.productId);
  if (byId != null && candidates.some((c) => c.id === byId)) return byId;

  const query = normalizeBuyerMatchText(hints.productName);
  if (!query) return null;

  const queryTokens = query.split(" ").filter(Boolean);
  let best: { id: number; score: number } | null = null;

  for (const candidate of candidates) {
    const candText = normalizeBuyerMatchText(candidate.label);
    if (!candText) continue;
    let score = 0;

    if (candText === query) score = 100;
    else if (candText.includes(query) || query.includes(candText)) score = 80;
    else if (queryTokens.length) {
      const hits = queryTokens.filter((t) => candText.includes(t)).length;
      score = hits * 10;
    }

    if (!best || score > best.score) best = { id: candidate.id, score };
  }

  return best && best.score >= 20 ? best.id : null;
}

function sanitizeBuyerAssistantActions(params: {
  raw: unknown;
  available: BuyerActionCandidate[];
  cart: BuyerActionCandidate[];
}): any[] {
  const { raw, available, cart } = params;
  if (!Array.isArray(raw)) return [];

  const MAX_ACTIONS = 8;
  const allowed = new Set([
    "ADD_TO_CART",
    "SET_CART_QUANTITY",
    "REMOVE_FROM_CART",
    "CLEAR_CART",
    "OPEN_CART",
    "START_CHECKOUT",
    "VIEW_PRODUCT",
  ]);

  const combinedCandidates = [...available, ...cart];
  const cartIds = new Set(cart.map((c) => c.id));

  const sanitized: any[] = [];
  for (const action of raw) {
    if (!action || typeof action !== "object") continue;
    const type = normalizeBuyerActionType((action as any).type);
    if (!allowed.has(type)) continue;

    if (type === "ADD_TO_CART") {
      const productId = resolveBuyerActionProductId(
        { productId: (action as any).productId, productName: (action as any).productName },
        combinedCandidates,
      );
      if (productId == null) continue;
      const quantity = clampInt((action as any).quantity, { min: 1, max: 99, fallback: 1 });
      sanitized.push({ type, productId, quantity });
    } else if (type === "SET_CART_QUANTITY") {
      const productId = resolveBuyerActionProductId(
        { productId: (action as any).productId, productName: (action as any).productName },
        combinedCandidates,
      );
      if (productId == null) continue;
      if (!cartIds.has(productId)) continue;
      const quantity = clampInt((action as any).quantity, { min: 0, max: 99, fallback: 1 });
      sanitized.push({ type, productId, quantity });
    } else if (type === "REMOVE_FROM_CART") {
      const productId = resolveBuyerActionProductId(
        { productId: (action as any).productId, productName: (action as any).productName },
        combinedCandidates,
      );
      if (productId == null) continue;
      if (!cartIds.has(productId)) continue;
      sanitized.push({ type, productId });
    } else if (type === "VIEW_PRODUCT") {
      const productId = resolveBuyerActionProductId(
        { productId: (action as any).productId, productName: (action as any).productName },
        combinedCandidates,
      );
      if (productId == null) continue;
      sanitized.push({ type, productId });
    } else if (type === "CLEAR_CART" || type === "OPEN_CART" || type === "START_CHECKOUT") {
      sanitized.push({ type });
    }

    if (sanitized.length >= MAX_ACTIONS) break;
  }

  return sanitized;
}

async function verifySession(token: string | undefined) {
  if (!token) return null;
  
  const session = await db.query.eceSessions.findFirst({
    where: eq(eceSessions.token, token)
  });

  if (!session || new Date(session.expiresAt) < new Date()) {
    return null;
  }

  const user = await db.query.eceUsers.findFirst({
    where: eq(eceUsers.id, session.userId)
  });

  return user;
}

const WHOLESALE_GOLD_MARKET_KEY = "wholesale_gold" as const;

function normalizeMarketKey(marketKeyRaw: string): string | null {
  const k = String(marketKeyRaw || "").trim().toLowerCase();
  if (k === "wholesale_gold" || k === "wholesale-gold") return WHOLESALE_GOLD_MARKET_KEY;
  return null;
}

function isEceAdmin(user: any): boolean {
  const roles = (user?.roles || []) as string[];
  return user?.role === "admin" || roles.includes("admin") || isChairmanAssistantUser(user);
}

async function requireEceAuth(req: any, res: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const user = await verifySession(token);
  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  return { token, user };
}

async function requireSellerAccessBySellerId(req: any, res: any, sellerId: number) {
  const tenant = requireTenant(req, res);
  if (!tenant) return null;

  const auth = await requireEceAuth(req, res);
  if (!auth) return null;

  const tenantId = tenant.id;
  const user = auth.user as any;
  const isAdminViewer = isEceAdmin(user);

  const seller = await db.query.sellers.findFirst({
    where: and(eq(sellers.id, sellerId), eq(sellers.tenantId, tenantId)),
  });

  if (!seller) {
    res.status(404).json({ message: "Seller not found" });
    return null;
  }

  if (!isAdminViewer && Number(seller.userId) !== Number(user.id)) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  return { tenant, tenantId, user, isAdminViewer, seller };
}

async function requireSellerAccessByProductId(req: any, res: any, productId: number) {
  const tenant = requireTenant(req, res);
  if (!tenant) return null;

  const auth = await requireEceAuth(req, res);
  if (!auth) return null;

  const tenantId = tenant.id;
  const user = auth.user as any;
  const isAdminViewer = isEceAdmin(user);

  const [product] = await db
    .select()
    .from(sellerProducts)
    .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));

  if (!product) {
    res.status(404).json({ message: "Product not found" });
    return null;
  }

  const seller = await db.query.sellers.findFirst({
    where: and(eq(sellers.id, Number(product.sellerId)), eq(sellers.tenantId, tenantId)),
  });

  if (!seller) {
    res.status(404).json({ message: "Seller not found" });
    return null;
  }

  if (!isAdminViewer && Number(seller.userId) !== Number(user.id)) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  return { tenant, tenantId, user, isAdminViewer, seller, product };
}

function cleanModelText(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^["'`]+/, "").replace(/["'`]+$/, "").trim();
}

function buildSellerProductSuggestionFallback(input: {
  field: string;
  tenantKey: string;
  product: any;
  category: any | null;
  seller: any | null;
}) {
  const categoryName = String(input.category?.name || "").trim();
  const categorySlug = String(input.category?.slug || "").trim();
  const shopName = String(input.seller?.shopName || "").trim();
  const name = String(input.product?.name || "").trim();
  const shortDescription = String(input.product?.shortDescription || "").trim();
  const description = String(input.product?.description || "").trim();
  const tags = Array.isArray(input.product?.tags) ? input.product.tags : [];

  if (input.field === "name") return name || (categoryName ? `${categoryName} (Draft)` : "Product (Draft)");
  if (input.field === "shortDescription") {
    return shortDescription || [name || categoryName || "Premium product", shopName ? `from ${shopName}` : null].filter(Boolean).join(" - ");
  }
  if (input.field === "description") {
    return (
      description ||
      [
        name || categoryName || "Premium product",
        categoryName || categorySlug ? `Category: ${categoryName || categorySlug}` : null,
        shopName ? `Seller: ${shopName}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  if (input.field === "tags") {
    if (tags.length) return tags.join(", ");
    return [categorySlug, categoryName ? categoryName.toLowerCase().replace(/\s+/g, "-") : null, "premium", input.tenantKey]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

router.get("/markets/:marketKey/access", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;

    const marketKey = normalizeMarketKey(req.params.marketKey);
    if (!marketKey) return res.status(404).json({ message: "Unknown market" });

    const user = auth.user as any;
    const isApproved =
      (marketKey === WHOLESALE_GOLD_MARKET_KEY && user.buyerType === "wholesale") || isEceAdmin(user);

    const latestRequest = await db.query.marketAccessRequests.findFirst({
      where: and(
        eq(marketAccessRequests.userId, user.id),
        eq(marketAccessRequests.marketKey, marketKey),
        eq(marketAccessRequests.tenantId, tenantId),
      ),
      orderBy: [desc(marketAccessRequests.createdAt)],
    });

    res.json({
      marketKey,
      status: isApproved ? "approved" : (latestRequest?.status || "none"),
      request: latestRequest || null,
    });
  } catch (error: any) {
    console.error("[Markets] Access status error:", error);
    res.status(500).json({ message: "Failed to load access status" });
  }
});

router.post("/markets/:marketKey/access-requests", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;

    const marketKey = normalizeMarketKey(req.params.marketKey);
    if (!marketKey) return res.status(404).json({ message: "Unknown market" });

    const user = auth.user as any;
    if (marketKey === WHOLESALE_GOLD_MARKET_KEY && user.buyerType === "wholesale") {
      return res.json({ marketKey, status: "approved" });
    }

    const existingPending = await db.query.marketAccessRequests.findFirst({
      where: and(
        eq(marketAccessRequests.userId, user.id),
        eq(marketAccessRequests.marketKey, marketKey),
        eq(marketAccessRequests.status, "pending"),
        eq(marketAccessRequests.tenantId, tenantId),
      ),
      orderBy: [desc(marketAccessRequests.createdAt)],
    });

    if (existingPending) {
      return res.json({ marketKey, status: existingPending.status, request: existingPending });
    }

    const { businessName, licenseFileName, notes } = (req.body || {}) as {
      businessName?: string;
      licenseFileName?: string;
      notes?: string;
    };

    const [created] = await db
      .insert(marketAccessRequests)
      .values({
        tenantId,
        userId: user.id,
        marketKey,
        businessName: businessName ? String(businessName).slice(0, 300) : null,
        licenseFileName: licenseFileName ? String(licenseFileName).slice(0, 300) : null,
        notes: notes ? String(notes).slice(0, 5000) : null,
        status: "pending",
      })
      .returning();

    res.status(201).json({ marketKey, status: "pending", request: created });
  } catch (error: any) {
    console.error("[Markets] Create access request error:", error);
    res.status(500).json({ message: "Failed to create access request" });
  }
});

router.get("/admin/markets/:marketKey/access-requests", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;
    if (!isEceAdmin(auth.user)) return res.status(403).json({ message: "Admin access required" });

    const marketKey = normalizeMarketKey(req.params.marketKey);
    if (!marketKey) return res.status(404).json({ message: "Unknown market" });

    const rows = await db
      .select({
        id: marketAccessRequests.id,
        userId: marketAccessRequests.userId,
        marketKey: marketAccessRequests.marketKey,
        businessName: marketAccessRequests.businessName,
        licenseFileName: marketAccessRequests.licenseFileName,
        notes: marketAccessRequests.notes,
        status: marketAccessRequests.status,
        adminComment: marketAccessRequests.adminComment,
        reviewedBy: marketAccessRequests.reviewedBy,
        reviewedAt: marketAccessRequests.reviewedAt,
        createdAt: marketAccessRequests.createdAt,
        updatedAt: marketAccessRequests.updatedAt,
        userEmail: eceUsers.email,
        userDisplayName: eceUsers.displayName,
        userBuyerType: eceUsers.buyerType,
        userRoles: eceUsers.roles,
        userRole: eceUsers.role,
      })
      .from(marketAccessRequests)
      .leftJoin(eceUsers, eq(marketAccessRequests.userId, eceUsers.id))
      .where(and(eq(marketAccessRequests.marketKey, marketKey), eq(marketAccessRequests.tenantId, tenantId)))
      .orderBy(desc(marketAccessRequests.createdAt));

    res.json({
      marketKey,
      requests: rows.map((r) => ({
        id: r.id,
        marketKey: r.marketKey,
        businessName: r.businessName,
        licenseFileName: r.licenseFileName,
        notes: r.notes,
        status: r.status,
        adminComment: r.adminComment,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        user: {
          id: r.userId,
          email: r.userEmail,
          displayName: r.userDisplayName,
          buyerType: r.userBuyerType,
          role: r.userRole,
          roles: r.userRoles,
        },
      })),
    });
  } catch (error: any) {
    console.error("[Markets] Admin list access requests error:", error);
    res.status(500).json({ message: "Failed to load access requests" });
  }
});

router.patch("/admin/markets/:marketKey/access-requests/:id", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;
    if (!isEceAdmin(auth.user)) return res.status(403).json({ message: "Admin access required" });

    const marketKey = normalizeMarketKey(req.params.marketKey);
    if (!marketKey) return res.status(404).json({ message: "Unknown market" });

    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });

    const { status, adminComment } = (req.body || {}) as { status?: string; adminComment?: string };
    if (status !== "approved" && status !== "rejected") {
      return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });
    }

    const now = new Date();
    const [updated] = await db
      .update(marketAccessRequests)
      .set({
        status,
        adminComment: adminComment ? String(adminComment).slice(0, 5000) : null,
        reviewedBy: (auth.user as any).id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(marketAccessRequests.id, requestId),
          eq(marketAccessRequests.marketKey, marketKey),
          eq(marketAccessRequests.tenantId, tenantId),
        ),
      )
      .returning();

    if (!updated) return res.status(404).json({ message: "Request not found" });

    if (status === "approved" && marketKey === WHOLESALE_GOLD_MARKET_KEY) {
      await db.update(eceUsers).set({ buyerType: "wholesale", updatedAt: now }).where(eq(eceUsers.id, updated.userId));
    }

    res.json({ request: updated });
  } catch (error: any) {
    console.error("[Markets] Admin update access request error:", error);
    res.status(500).json({ message: "Failed to update access request" });
  }
});

router.get("/admin/sourcing-requests", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;
    if (!isEceAdmin(auth.user)) return res.status(403).json({ message: "Admin access required" });

    const status = req.query.status ? String(req.query.status) : undefined;
    const allowedStatus = new Set(["open", "sourcing", "matched", "closed"]);
    if (status && !allowedStatus.has(status)) {
      return res.status(400).json({ message: "Invalid status filter" });
    }

    const rows = await db
      .select({
        id: sourcingRequests.id,
        requesterUserId: sourcingRequests.requesterUserId,
        guestSessionId: sourcingRequests.guestSessionId,
        productQuery: sourcingRequests.productQuery,
        quantityIntent: sourcingRequests.quantityIntent,
        urgency: sourcingRequests.urgency,
        qualityNotes: sourcingRequests.qualityNotes,
        marketKey: sourcingRequests.marketKey,
        location: sourcingRequests.location,
        status: sourcingRequests.status,
        adminNotes: sourcingRequests.adminNotes,
        createdAt: sourcingRequests.createdAt,
        updatedAt: sourcingRequests.updatedAt,
        userEmail: eceUsers.email,
        userDisplayName: eceUsers.displayName,
      })
      .from(sourcingRequests)
      .leftJoin(eceUsers, eq(sourcingRequests.requesterUserId, eceUsers.id))
      .where(
        buildWhere([
          eq(sourcingRequests.tenantId, tenantId),
          status ? eq(sourcingRequests.status, status as any) : undefined,
        ]) ?? sql`TRUE`,
      )
      .orderBy(desc(sourcingRequests.createdAt))
      .limit(200);

    res.json({
      requests: rows.map((r) => ({
        id: r.id,
        productQuery: r.productQuery,
        quantityIntent: r.quantityIntent,
        urgency: r.urgency,
        qualityNotes: r.qualityNotes,
        marketKey: r.marketKey,
        location: r.location,
        status: r.status,
        adminNotes: r.adminNotes,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        requester: r.requesterUserId
          ? { id: r.requesterUserId, email: r.userEmail, displayName: r.userDisplayName }
          : null,
        guestSessionId: r.guestSessionId || null,
      })),
    });
  } catch (error: any) {
    console.error("[Sourcing] Admin list error:", error);
    res.status(500).json({ message: "Failed to load sourcing requests" });
  }
});

router.patch("/admin/sourcing-requests/:id", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;
    if (!isEceAdmin(auth.user)) return res.status(403).json({ message: "Admin access required" });

    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId)) return res.status(400).json({ message: "Invalid request id" });

    const allowedStatus = new Set(["open", "sourcing", "matched", "closed"]);
    const { status, adminNotes } = (req.body || {}) as { status?: string; adminNotes?: string };
    if (status && !allowedStatus.has(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const now = new Date();
    const [updated] = await db
      .update(sourcingRequests)
      .set({
        ...(status ? { status: status as any } : {}),
        ...(adminNotes !== undefined ? { adminNotes: adminNotes ? String(adminNotes).slice(0, 5000) : null } : {}),
        updatedAt: now,
      })
      .where(and(eq(sourcingRequests.id, requestId), eq(sourcingRequests.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ message: "Request not found" });
    res.json({ request: updated });
  } catch (error: any) {
    console.error("[Sourcing] Admin update error:", error);
    res.status(500).json({ message: "Failed to update sourcing request" });
  }
});

router.get("/admin/territory-metrics", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;
    if (!isEceAdmin(auth.user)) return res.status(403).json({ message: "Admin access required" });

    const days = req.query.days ? Math.max(1, Math.min(365, Number(req.query.days))) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        id: sourcingRequests.id,
        status: sourcingRequests.status,
        location: sourcingRequests.location,
        createdAt: sourcingRequests.createdAt,
      })
      .from(sourcingRequests)
      .where(and(gte(sourcingRequests.createdAt, since), eq(sourcingRequests.tenantId, tenantId)))
      .orderBy(desc(sourcingRequests.createdAt))
      .limit(2000);

    const buckets = new Map<
      string,
      {
        key: string;
        label: string;
        countryId?: number;
        cityId?: number;
        countryName?: string;
        cityName?: string;
        counts: Record<string, number>;
        lastSeenAt: string;
      }
    >();

    for (const r of rows) {
      const loc: any = r.location || {};
      const cityId = typeof loc.cityId === "number" ? loc.cityId : undefined;
      const countryId = typeof loc.countryId === "number" ? loc.countryId : undefined;
      const key = cityId ? `city:${cityId}` : countryId ? `country:${countryId}` : "unknown";
      const label =
        (loc.label as string) ||
        (loc.cityName && loc.countryName ? `${loc.cityName}, ${loc.countryName}` : loc.cityName || loc.countryName) ||
        "Unknown";

      const existing = buckets.get(key) || {
        key,
        label,
        countryId,
        cityId,
        countryName: loc.countryName,
        cityName: loc.cityName,
        counts: { open: 0, sourcing: 0, matched: 0, closed: 0 } as Record<string, number>,
        lastSeenAt: r.createdAt ? new Date(r.createdAt as any).toISOString() : new Date().toISOString(),
      };

      const statusKey = String(r.status);
      existing.counts[statusKey] = (existing.counts[statusKey] || 0) + 1;
      existing.lastSeenAt = r.createdAt ? new Date(r.createdAt as any).toISOString() : existing.lastSeenAt;
      buckets.set(key, existing);
    }

    res.json({
      windowDays: days,
      territories: Array.from(buckets.values()).sort((a, b) => b.counts.open - a.counts.open),
    });
  } catch (error: any) {
    console.error("[Metrics] Territory metrics error:", error);
    res.status(500).json({ message: "Failed to load territory metrics" });
  }
});

const MARKETPLACE_SYSTEM_PROMPT = `You are the Bourse de l'Or AI Concierge, a merchant-of-record gold-only assistant.

${BDO_POLICY_SNIPPET}

NON-NEGOTIABLE SCOPE:
1. Discuss gold products and gold services only (dore lots, stamped bars in grams, jewelry/heritage items, virtual vault, delivery, authorized resale).
2. If the user asks about anything non-gold, politely refuse and redirect to gold options.

YOUR CAPABILITIES:
1. Recommend gold products based on needs, location, and budget.
2. Add gold products to cart and guide users through checkout.
3. Explain purity, provenance, certifications, and pricing per gram.

REFUSAL TEMPLATE:
"Bourse de l'Or is dedicated to gold only. I can help with bars, jewelry, dore lots, vault storage, delivery, or resale. What do you want to explore?"

ACTIONS YOU CAN TRIGGER:
When you want to perform an action, include it in your response using this format:
[[ACTION:action_name:parameters]]

Available actions:
- [[ACTION:ADD_TO_CART:productId,quantity]] - Add a product to cart
- [[ACTION:VIEW_PRODUCT:productId]] - Show product details
- [[ACTION:START_CHECKOUT]] - Begin checkout process
- [[ACTION:SHOW_CATEGORY:categorySlug]] - Filter by category
- [[ACTION:SEARCH_PRODUCTS:query]] - Search for products

RESPONSE STYLE:
- Be conversational, warm, and professional.
- When recommending products, mention key details: price, quantity available, producer name.
- If the user wants to buy something, suggest adding to cart.
- If the cart has items and the user seems ready, suggest checkout.
- Keep responses concise but helpful (2-4 sentences typical).

Example responses:
- "I found 3 options sourced from licensed suppliers and sold by Bourse de l'Or. Here's one to view: [[ACTION:VIEW_PRODUCT:5]] Want me to add it to your cart?"
- "Great choice! I've added 20g of stamped gold to your cart. [[ACTION:ADD_TO_CART:12,1]] Ready to checkout?"
- "Let me start the checkout for you! [[ACTION:START_CHECKOUT]] Just follow the prompts to complete your order."`;

const MULTI_PRODUCT_SYSTEM_PROMPT = `You are the Exportunity marketplace concierge.

YOUR CAPABILITIES:
1. Help users discover products and services across multiple categories.
2. Recommend items based on location, needs, and budget.
3. Add items to cart and guide users through checkout.
4. Ask clarifying questions when product specs, quantity, or delivery preferences are missing.

RESPONSE FORMAT - Use action tags:
- [[ACTION:ADD_TO_CART:productId,quantity]]
- [[ACTION:VIEW_PRODUCT:productId]]
- [[ACTION:START_CHECKOUT]]
- [[ACTION:SHOW_CATEGORY:categorySlug]]
- [[ACTION:SEARCH_PRODUCTS:query]]

RESPONSE STYLE:
- Be concise, professional, and helpful.
- Highlight availability, price, and seller name.
- Encourage checkout when the cart is ready.`;


const GOLD_CATEGORY_SLUGS = ["dore", "stamped", "jewelry", "gold-art"] as const;

function goldOnlyWhere() {
  // In gold tenants, product copy is often French ("or", "en or", "d'or").
  // Use a word-boundary regex to avoid matching "for"/"order"/etc.
  const wordOr = "\\mor\\M";

  return or(
    inArray(productCategories.slug, [...GOLD_CATEGORY_SLUGS]),
    sql`${sellerProducts.tags} ? 'gold'`,
    ilike(sellerProducts.name, "%gold%"),
    ilike(sellerProducts.description, "%gold%"),
    ilike(sellerProducts.name, "%dore%"),
    ilike(sellerProducts.description, "%dore%"),
    ilike(sellerProducts.name, "%d'or%"),
    ilike(sellerProducts.description, "%d'or%"),
    sql`${sellerProducts.name} ~* ${wordOr}`,
    sql`${sellerProducts.description} ~* ${wordOr}`,
  )!;
}

function goldCategoryFilterWhere(slug: string) {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized) return sql`TRUE`;

  const hasTag = (tag: string) => sql`${sellerProducts.tags} ? ${tag}`;

  const ilikeAny = (column: any, needles: string[]) => {
    const conditions = needles.map((needle) => ilike(column, `%${needle}%`));
    return or(...conditions)!;
  };

  if (normalized === "dore") {
    const needles = ["dore", "doré", "dorè", "raw", "lot", "bulk"];
    return or(eq(productCategories.slug, "dore"), ilikeAny(sellerProducts.name, needles), ilikeAny(sellerProducts.description, needles), hasTag("dore"))!;
  }

  if (normalized === "stamped") {
    const needles = ["stamped", "bar", "bars", "ingot", "lingot", "piece", "coin", "24k", "22k", "18k"];
    return or(
      eq(productCategories.slug, "stamped"),
      ilikeAny(sellerProducts.name, needles),
      ilikeAny(sellerProducts.description, needles),
      hasTag("stamped"),
      hasTag("bar"),
      hasTag("ingot"),
    )!;
  }

  if (normalized === "jewelry") {
    const needles = ["jewel", "jewelry", "bijou", "bracelet", "bague", "ring", "chain", "chaine", "pendentif", "pendant", "earring", "collier"];
    return or(eq(productCategories.slug, "jewelry"), ilikeAny(sellerProducts.name, needles), ilikeAny(sellerProducts.description, needles), hasTag("jewelry"))!;
  }

  if (normalized === "gold-art") {
    const needles = [
      "gold art",
      "heritage",
      "bust",
      "buste",
      "medallion",
      "medaillon",
      "relief",
      "ceremonial",
      "sculpt",
      "statue",
      "statuette",
      "mask",
      "masque",
      "artifact",
      "objet",
      "object",
    ];
    return or(
      eq(productCategories.slug, "gold-art"),
      ilikeAny(sellerProducts.name, needles),
      ilikeAny(sellerProducts.description, needles),
      hasTag("gold-art"),
      hasTag("gold_art"),
      hasTag("art"),
    )!;
  }

  return eq(productCategories.slug, normalized);
}

const MARKETPLACE_INTEGRITY_LOG_ONCE = new Set<string>();

function normalizeForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function coerceTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t)).filter(Boolean);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t)).filter(Boolean);
    } catch {
      // ignore
    }
    return trimmed
      .split(/[,]+/g)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

const GOLD_INTEGRITY_NON_GOLD_CUES = [
  "cassava",
  "flour",
  "butter",
  "shea",
  "tomato",
  "banana",
  "avocado",
  "mango",
  "rice",
  "beans",
  "maize",
  "corn",
  "oil",
  "soap",
  "milk",
  "bread",
  "fruit",
  "vegetable",
  "organic",
  "fresh",
  "produce",
  "grocery",
  "food",
] as const;

function shouldBlockGoldCategoryMismatch(input: { categorySlug: string | null; product: any }) {
  const slug = String(input.categorySlug || "").trim().toLowerCase();
  if (!slug || !(GOLD_CATEGORY_SLUGS as readonly string[]).includes(slug)) return null;

  const nameRaw = String(input.product?.name ?? "");
  const descRaw = String(input.product?.description ?? "");

  // Tags are user-editable and can be wrong. We still use them for spotting non-gold cues,
  // but we do NOT use tags as evidence of being gold when non-gold cues are present.
  const tags = coerceTags(input.product?.tags).map(normalizeForMatch);
  const nameText = normalizeForMatch(nameRaw);
  const text = normalizeForMatch(`${nameRaw} ${descRaw}`);

  // Hard guard: if the product NAME looks like food/produce/etc, never show it in a gold-only category.
  const hasNonGoldCueInName = GOLD_INTEGRITY_NON_GOLD_CUES.some((k) => nameText.includes(k));
  if (hasNonGoldCueInName) {
    return {
      reason: `gold_integrity_mismatch:${slug}`,
      details: {
        categorySlug: slug,
        name: nameRaw.slice(0, 240),
        cue: "non_gold_cue_in_name",
      },
    };
  }

  const hasNonGoldCue = GOLD_INTEGRITY_NON_GOLD_CUES.some((k) => text.includes(k) || tags.includes(k));
  if (!hasNonGoldCue) return null;

  const goldCoreCues = ["gold", "dore", "dor", "bullion", "karat", "22k", "18k", "ingot", "lingot", "bar", "stamped"];
  const jewelryCues = ["jewel", "bijou", "ring", "bracelet", "chain", "pendant", "earring", "necklace", "cuff", "bangle"];
  const artCues = ["medallion", "bust", "artifact", "sculpt", "statue", "ceremonial", "relief", "object"];

  const cueSets: Record<string, string[]> = {
    dore: ["dore", "dor", "dor\u00e9", "dor\u00e8"],
    stamped: [...goldCoreCues, "stamp", "piece"],
    jewelry: [...jewelryCues, ...goldCoreCues],
    "gold-art": [...artCues, ...goldCoreCues],
  };

  // Only trust NAME/DESCRIPTION when deciding "is gold" under mismatch conditions.
  const hasGoldCue = (cueSets[slug] || goldCoreCues).some((k) => text.includes(k));
  if (hasGoldCue) return null;

  return {
    reason: `gold_integrity_mismatch:${slug}`,
    details: {
      categorySlug: slug,
      name: nameRaw.slice(0, 240),
    },
  };
}

async function logMarketplaceIntegrityOnce(input: {
  req: any;
  tenantId: number;
  entityType: string;
  entityId: number | null;
  action: string;
  metadata?: Record<string, any>;
}) {
  const key = `${input.tenantId}:${input.entityType}:${input.entityId ?? "none"}:${input.action}`;
  if (MARKETPLACE_INTEGRITY_LOG_ONCE.has(key)) return;
  MARKETPLACE_INTEGRITY_LOG_ONCE.add(key);
  try {
    await db.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: null,
      userRole: "public",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ipAddress: String(input.req?.ip || ""),
      userAgent: String(input.req?.headers?.["user-agent"] || ""),
      metadata: input.metadata || {},
      createdAt: new Date(),
    } as any);
  } catch {
    // best-effort logging only
  }
}

router.get("/producers", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const { lat, lng, category, radius = "10" } = req.query;
    
    const allProducers = await db.query.producers.findMany({
      where: and(eq(producers.status, "active"), eq(producers.tenantId, tenantId)),
      with: {
        category: true,
        products: {
          limit: 5
        }
      },
      orderBy: [desc(producers.isVerified), desc(producers.rating)]
    });

    const producersWithCategory = allProducers.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      type: p.type,
      categoryName: p.category?.name,
      shortDescription: p.shortDescription,
      latitude: p.latitude,
      longitude: p.longitude,
      city: p.city,
      country: p.country,
      rating: p.rating,
      isVerified: p.isVerified,
      phone: p.phone,
      deliveryOptions: p.deliveryOptions,
      products: p.products
    }));

    res.json(producersWithCategory);
  } catch (error: any) {
    console.error("[Marketplace] Fetch producers error:", error);
    res.status(500).json({ message: "Failed to fetch producers" });
  }
});

router.get("/producers/:slug", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const { slug } = req.params;
    
    const producer = await db.query.producers.findFirst({
      where: and(eq(producers.slug, slug), eq(producers.tenantId, tenantId)),
      with: {
        category: true,
        products: true
      }
    });

    if (!producer) {
      return res.status(404).json({ message: "Producer not found" });
    }

    res.json(producer);
  } catch (error: any) {
    console.error("[Marketplace] Fetch producer error:", error);
    res.status(500).json({ message: "Failed to fetch producer" });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const categories = await db.query.producerCategories.findMany({
      where: eq(producerCategories.tenantId, tenantId),
      orderBy: [asc(producerCategories.name)]
    });

    res.json(categories);
  } catch (error: any) {
    console.error("[Marketplace] Fetch categories error:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;
    const goldOnly = isGoldTenantKey(tenant.key);

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    
    const { content, guestSessionId, location, producerId, cart, conversationHistory } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Message content required" });
    }

    let contextInfo = "";
    
    if (location) {
      contextInfo += `\nUser location: approximately ${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}`;
    }

    // Add cart context
    if (cart && cart.length > 0) {
      const cartTotal = cart.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      contextInfo += `\n\nUSER'S CART (${cart.length} items, total: ${cartTotal.toLocaleString()} XOF):`;
      cart.forEach((item: any, i: number) => {
        contextInfo += `\n- ${item.name} x${item.quantity} = ${(item.price * item.quantity).toLocaleString()} XOF (from ${item.shopName})`;
      });
      contextInfo += `\n\nNote: User has items in cart. If they seem ready to buy, suggest checkout with [[ACTION:START_CHECKOUT]]`;
    } else {
      contextInfo += `\n\nUSER'S CART: Empty`;
    }

    // Get available products with sellers
    const availableProducts = await db.select({
      product: sellerProducts,
      seller: sellers,
      category: productCategories
    })
      .from(sellerProducts)
      .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
      .leftJoin(
        productCategories,
        and(eq(sellerProducts.categoryId, productCategories.id), eq(productCategories.tenantId, tenantId)),
      )
      .where(
        buildWhere([
          eq(sellerProducts.status, 'active'),
          eq(sellerProducts.tenantId, tenantId),
          eq(sellers.tenantId, tenantId),
          goldOnly ? goldOnlyWhere() : undefined,
        ]) ?? sql`TRUE`,
      )
      .limit(15);

    if (availableProducts.length > 0) {
      contextInfo += `\n\nAVAILABLE PRODUCTS (use productId for actions):`;
      availableProducts.forEach((p) => {
        contextInfo += `\n- ID:${p.product.id} "${p.product.name}" by ${p.seller?.shopName || 'Unknown'} - ${parseFloat(p.product.price).toLocaleString()} XOF (${p.category?.name || 'General'})`;
        if (p.product.shortDescription) contextInfo += ` - ${p.product.shortDescription}`;
      });
    }

    // Build conversation messages
    const messages: { role: "user" | "assistant"; content: string }[] = [];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.slice(-6).forEach((msg: any) => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      });
    }
    messages.push({ role: "user", content });

    if (!openai && !anthropic) {
      return res.json({
        response: "AI chat is not configured. Set OPENAI_API_KEY (recommended) or ANTHROPIC_API_KEY to enable the assistant.",
        actions: [],
      });
    }

    const aiResponse =
      (await createChatCompletionText({
        system: `${goldOnly ? MARKETPLACE_SYSTEM_PROMPT : MULTI_PRODUCT_SYSTEM_PROMPT}\n\n--- CURRENT CONTEXT ---${contextInfo}`,
        messages,
        maxTokens: 900,
        temperature: 0.7,
        sanitize: goldOnly ? (text) => sanitizeBdoText(text).text : undefined,
      })) || "I apologize, I couldn't process that request.";

    // Parse actions from the response
    const actionRegex = /\[\[ACTION:([A-Z_]+)(?::([^\]]+))?\]\]/g;
    const actions: { type: string; params?: string }[] = [];
    let match;
    while ((match = actionRegex.exec(aiResponse)) !== null) {
      actions.push({ type: match[1], params: match[2] });
    }

    // Clean action tags from displayed response
    const cleanResponse = aiResponse.replace(actionRegex, '').trim();

    res.json({ 
      response: cleanResponse,
      actions
    });
  } catch (error: any) {
    console.error("[Marketplace] Chat error:", error);
    res.status(500).json({ message: "Failed to process message", error: error.message });
  }
});

router.post("/producers/:producerId/chat", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    
    const { producerId } = req.params;
    const { content, guestSessionId } = req.body;

    const producer = await db.query.producers.findFirst({
      where: and(eq(producers.id, parseInt(producerId)), eq(producers.tenantId, tenantId)),
      with: {
        category: true,
        products: true
      }
    });

    if (!producer) {
      return res.status(404).json({ message: "Producer not found" });
    }

    const shopSystemPrompt = `You are the AI assistant for ${producer.name}, a ${producer.type} specializing in ${producer.category?.name || "various products"}.

Shop description: ${producer.description || producer.shortDescription || "A local producer"}

Available products:
${producer.products.map(p => `- ${p.name}: ${p.price} ${p.currency || "XOF"} ${p.unit ? `per ${p.unit}` : ""}`).join("\n") || "Contact for product list"}

Delivery options: ${(producer.deliveryOptions as string[])?.join(", ") || "Pickup available"}

Your role:
1. Welcome customers warmly
2. Help them find products they need
3. Provide pricing and availability information
4. Explain delivery/pickup options
5. Help place orders

Be friendly, helpful, and represent ${producer.name} professionally.`;

    if (!openai && !anthropic) {
      return res.json({
        response: "AI chat is not configured. Set OPENAI_API_KEY (recommended) or ANTHROPIC_API_KEY to enable shop chat.",
        producer: { id: producer.id, name: producer.name },
      });
    }

    const aiResponse =
      (await createChatCompletionText({
        system: shopSystemPrompt,
        messages: [{ role: "user", content }],
        maxTokens: 800,
        temperature: 0.6,
      })) || "I apologize, I couldn't process that request.";

    res.json({ response: aiResponse, producer: { id: producer.id, name: producer.name } });
  } catch (error: any) {
    console.error("[Marketplace] Shop chat error:", error);
    res.status(500).json({ message: "Failed to process message", error: error.message });
  }
});

router.post("/producers/:producerId/agent-chat", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);
    
    const { producerId } = req.params;
    const { userRequest, userPreferences, conversationHistory = [] } = req.body;

    const producer = await db.query.producers.findFirst({
      where: and(eq(producers.id, parseInt(producerId)), eq(producers.tenantId, tenantId)),
      with: {
        category: true,
        products: true
      }
    });

    if (!producer) {
      return res.status(404).json({ message: "Producer not found" });
    }

    const userAgentSystemPrompt = `You are an AI shopping assistant representing a customer who wants to buy from ${producer.name}.

Customer's request: ${userRequest}
${userPreferences ? `Customer preferences: ${JSON.stringify(userPreferences)}` : ""}

Your goal is to help the customer get the best deal by:
1. Negotiating politely on their behalf
2. Asking about availability and quality
3. Confirming delivery options
4. Getting detailed pricing
5. Summarizing the best options for the customer

Respond as if you're speaking TO the shop's representative. Be polite but advocate for the customer's interests. Keep responses concise and focused.`;

    const shopAgentSystemPrompt = `You are the AI assistant for ${producer.name}, a ${producer.type} specializing in ${producer.category?.name || "various products"}.

Available products:
${producer.products.map(p => `- ${p.name}: ${p.price} ${p.currency || "XOF"} ${p.unit ? `per ${p.unit}` : ""} (${p.inStock ? 'In stock' : 'Out of stock'})`).join("\n") || "Contact for product list"}

Delivery options: ${(producer.deliveryOptions as string[])?.join(", ") || "Pickup available"}

You are now speaking with a customer's AI assistant who is shopping on their behalf. Be professional, provide accurate information about products and pricing, and try to make a sale while being honest about availability and limitations. Keep responses concise.`;

    if (!openai && !anthropic) {
      return res.json({
        exchanges: [
          { agent: "user", message: "AI is not configured. Set OPENAI_API_KEY (recommended) or ANTHROPIC_API_KEY to enable negotiation.", agentName: "Your Shopping Assistant" },
          { agent: "shop", message: "AI is not configured. Set OPENAI_API_KEY (recommended) or ANTHROPIC_API_KEY to enable negotiation.", agentName: `${producer.name} Assistant` },
        ],
        conversationHistory: conversationHistory || [],
        producer: { id: producer.id, name: producer.name },
      });
    }

    const sanitizedHistory = (conversationHistory || [])
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content }));

    const userAgentText =
      (await createChatCompletionText({
        system: userAgentSystemPrompt,
        messages:
          sanitizedHistory.length > 0
            ? sanitizedHistory
            : [{ role: "user", content: "Please start the negotiation with the shop on my behalf." }],
        maxTokens: 350,
        temperature: 0.7,
      })) || "Hello, I'd like to inquire about your products.";

    const shopMessages = [
      ...conversationHistory,
      { role: "user" as const, content: userAgentText }
    ];

    const shopAgentText =
      (await createChatCompletionText({
        system: shopAgentSystemPrompt,
        messages: shopMessages.map((m: any) => ({ role: m.role, content: m.content })),
        maxTokens: 350,
        temperature: 0.7,
      })) || "Hello! How can I help you today?";

    const updatedHistory = [
      ...conversationHistory,
      { role: "assistant" as const, content: userAgentText, agentType: "user" },
      { role: "user" as const, content: shopAgentText, agentType: "shop" }
    ];

    res.json({
      exchanges: [
        { agent: "user", message: userAgentText, agentName: "Your Shopping Assistant" },
        { agent: "shop", message: shopAgentText, agentName: `${producer.name} Assistant` }
      ],
      conversationHistory: updatedHistory,
      producer: { id: producer.id, name: producer.name }
    });
  } catch (error: any) {
    console.error("[Marketplace] Agent-to-agent chat error:", error);
    res.status(500).json({ message: "Failed to process agent conversation", error: error.message });
  }
});

router.get("/geo/continents", async (req, res) => {
  try {
    const continents = await db.select().from(geoContinents);
    res.json(continents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/geo/countries", async (req, res) => {
  try {
    const continentId = req.query.continentId ? parseInt(req.query.continentId as string) : undefined;
    const query = continentId 
      ? db.select().from(geoCountries).where(eq(geoCountries.continentId, continentId))
      : db.select().from(geoCountries);
    const countries = await query.orderBy(asc(geoCountries.name));
    res.json(countries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve approximate nearest city/region/country for coordinates (no external geocoding)
router.get("/geo/resolve", async (req, res) => {
  try {
    const userLat = Number(req.query.lat);
    const userLng = Number(req.query.lng);

    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      return res.status(400).json({ error: "lat and lng are required numeric query params" });
    }

    const distanceExpr = sql<number>`(
      ((${geoCities.latitude}::double precision - ${userLat}) * (${geoCities.latitude}::double precision - ${userLat})) +
      ((${geoCities.longitude}::double precision - ${userLng}) * (${geoCities.longitude}::double precision - ${userLng}))
    )`;

    const [nearest] = await db
      .select({
        city: geoCities,
        region: geoRegions,
        country: geoCountries,
        distance2: distanceExpr,
      })
      .from(geoCities)
      .leftJoin(geoRegions, eq(geoCities.regionId, geoRegions.id))
      .leftJoin(geoCountries, eq(geoRegions.countryId, geoCountries.id))
      .where(sql`${geoCities.latitude} IS NOT NULL AND ${geoCities.longitude} IS NOT NULL`)
      // Order by the full expression; ordering by a SELECT alias can fail on some generated queries.
      .orderBy(distanceExpr)
      .limit(1);

    if (!nearest?.city?.id || !nearest?.country?.id) {
      return res.status(200).json({
        country: null,
        region: null,
        city: null,
        source: "nearest_city_unavailable",
      });
    }

    return res.json({
      country: nearest.country,
      region: nearest.region,
      city: nearest.city,
      source: "nearest_city",
    });
  } catch (error: any) {
    console.error("[Geo] Resolve error:", error);
    // Zone/retail pages rely on this endpoint during initial load; fail-soft keeps UX functional.
    res.status(200).json({
      country: null,
      region: null,
      city: null,
      source: "resolve_error",
      error: "geo_resolve_failed",
    });
  }
});

router.get("/geo/regions/:countryId", async (req, res) => {
  try {
    const regions = await db.select().from(geoRegions).where(eq(geoRegions.countryId, parseInt(req.params.countryId)));
    res.json(regions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/geo/cities/:regionId", async (req, res) => {
  try {
    const cities = await db.select().from(geoCities).where(eq(geoCities.regionId, parseInt(req.params.regionId)));
    res.json(cities);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/geo/districts/:cityId", async (req, res) => {
  try {
    const districts = await db.select().from(geoDistricts).where(eq(geoDistricts.cityId, parseInt(req.params.cityId)));
    res.json(districts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/geo/neighborhoods/:districtId", async (req, res) => {
  try {
    const neighborhoods = await db.select().from(geoNeighborhoods).where(eq(geoNeighborhoods.districtId, parseInt(req.params.districtId)));
    res.json(neighborhoods);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/product-categories", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const dataTenant = await resolveMarketplaceDataTenant(tenant);
    const tenantId = dataTenant.id;
    const goldOnly = isGoldTenantKey(dataTenant.key);
    const markerStyles = await loadActiveMarkerStyles(tenantId);

    const categories = await db
      .select()
      .from(productCategories)
      .where(
        buildWhere([
          eq(productCategories.tenantId, tenantId),
          goldOnly ? inArray(productCategories.slug, [...GOLD_CATEGORY_SLUGS]) : undefined,
        ]) ?? sql`TRUE`,
      )
      .orderBy(asc(productCategories.sortOrder));
    res.json(
      categories.map((category: any) => {
        const key = normalizeMarkerStyleKey(category?.mapMarkerKey);
        const resolvedStyle = (key ? markerStyles.byKey.get(key) : null) || markerStyles.defaultStyle;
        return {
          ...category,
          mapMarkerKey: key || "shop_default",
          mapMarkerStyle: resolvedStyle,
        };
      }),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/map-marker-styles", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const dataTenant = await resolveMarketplaceDataTenant(tenant);
    const markerStyles = await loadActiveMarkerStyles(dataTenant.id);
    res.json(markerStyles.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/sellers", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const data = req.body;
    const slug = data.shopName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + nanoid(6);
    
    const [seller] = await db.insert(sellers).values({
      tenantId,
      userId: data.userId,
      shopName: data.shopName,
      slug,
      description: data.description,
      phoneNumber: data.phoneNumber,
      email: data.email,
      countryId: data.countryId,
      regionId: data.regionId,
      cityId: data.cityId,
      districtId: data.districtId,
      neighborhoodId: data.neighborhoodId,
      streetAddress: data.streetAddress,
      latitude: data.latitude?.toString(),
      longitude: data.longitude?.toString(),
      productionType: data.productionType,
      businessRegistration: data.businessRegistration,
      personalId: data.personalId,
      status: 'pending',
      isProducer: true,
    }).returning();
    
    res.status(201).json(seller);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/sellers", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const { status, search } = req.query;
    let allSellers;
    
    if (status || search) {
      const conditions = [];
      conditions.push(eq(sellers.tenantId, tenantId));
      if (status) conditions.push(eq(sellers.status, status as any));
      if (search) conditions.push(ilike(sellers.shopName, `%${search}%`));
      allSellers = await db.select().from(sellers).where(and(...conditions)).orderBy(desc(sellers.createdAt));
    } else {
      allSellers = await db
        .select()
        .from(sellers)
        .where(eq(sellers.tenantId, tenantId))
        .orderBy(desc(sellers.createdAt));
    }
    
    res.json(allSellers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/sellers/by-user/:userId", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;

    const viewer = auth.user as any;
    const isAdminViewer = isEceAdmin(viewer);

    const userId = parseInt(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: "Invalid userId" });
    if (!isAdminViewer && Number(viewer.id) !== Number(userId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const [seller] = await db
      .select()
      .from(sellers)
      .where(and(eq(sellers.userId, userId), eq(sellers.tenantId, tenantId)));
    if (!seller) return res.status(404).json({ error: "Seller not found" });
    res.json(seller);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/sellers/:id", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const sellerId = parseInt(req.params.id);
    if (!Number.isFinite(sellerId)) return res.status(400).json({ error: "Invalid seller id" });

    const [seller] = await db
      .select()
      .from(sellers)
      .where(and(eq(sellers.id, sellerId), eq(sellers.tenantId, tenantId)));
    if (!seller) return res.status(404).json({ error: "Seller not found" });

    const token = req.headers.authorization?.replace("Bearer ", "");
    const viewer = token ? await verifySession(token) : null;
    const isAdminViewer = isEceAdmin(viewer);
    const isOwner = viewer && Number((seller as any).userId) === Number((viewer as any).id);

    if (isAdminViewer || isOwner) {
      return res.json(seller);
    }

    return res.json({
      id: seller.id,
      tenantId: seller.tenantId,
      shopName: seller.shopName,
      slug: seller.slug,
      description: seller.description,
      logo: seller.logo,
      coverImage: seller.coverImage,
      sellerType: seller.sellerType,
      status: seller.status,
      neighborhoodId: seller.neighborhoodId,
      districtId: seller.districtId,
      cityId: seller.cityId,
      regionId: seller.regionId,
      countryId: seller.countryId,
      latitude: seller.latitude,
      longitude: seller.longitude,
      rating: seller.rating,
      reviewCount: seller.reviewCount,
      verifiedAt: seller.verifiedAt,
      createdAt: seller.createdAt,
      updatedAt: seller.updatedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/sellers/:id", async (req, res) => {
  try {
    const sellerId = parseInt(req.params.id);
    if (!Number.isFinite(sellerId)) return res.status(400).json({ error: "Invalid seller id" });

    const access = await requireSellerAccessBySellerId(req, res, sellerId);
    if (!access) return;

    const tenantId = access.tenantId;

    const [updated] = await db.update(sellers)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(sellers.id, sellerId), eq(sellers.tenantId, tenantId)))
      .returning();
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/sellers/:id/approve", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;

    const viewer = auth.user as any;
    if (!isEceAdmin(viewer)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { approvedBy } = req.body;
    const [updated] = await db.update(sellers)
      .set({ status: 'approved', approvedAt: new Date(), approvedBy, updatedAt: new Date() })
      .where(and(eq(sellers.id, parseInt(req.params.id)), eq(sellers.tenantId, tenantId)))
      .returning();
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/sellers/:id/reject", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;

    const viewer = auth.user as any;
    if (!isEceAdmin(viewer)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { reason } = req.body;
    const [updated] = await db.update(sellers)
      .set({ status: 'rejected', rejectionReason: reason, updatedAt: new Date() })
      .where(and(eq(sellers.id, parseInt(req.params.id)), eq(sellers.tenantId, tenantId)))
      .returning();
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/sellers/:id/stats", async (req, res) => {
  try {
    const sellerId = parseInt(req.params.id);
    if (!Number.isFinite(sellerId)) return res.status(400).json({ error: "Invalid seller id" });

    const access = await requireSellerAccessBySellerId(req, res, sellerId);
    if (!access) return;

    const tenantId = access.tenantId;
    const seller = access.seller as any;

    const prods = await db
      .select()
      .from(sellerProducts)
      .where(and(eq(sellerProducts.sellerId, sellerId), eq(sellerProducts.tenantId, tenantId)));
    const orders = await db
      .select()
      .from(marketplaceOrders)
      .where(and(eq(marketplaceOrders.sellerId, sellerId), eq(marketplaceOrders.tenantId, tenantId)));
    
    const completedOrders = orders.filter(o => o.status === 'delivered');
    const pendingOrders = orders.filter(o => o.status && ['pending', 'confirmed', 'processing'].includes(o.status));
    const activeProducts = prods.filter(p => p.status === 'active');
    
    res.json({
      seller,
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      pendingOrders: pendingOrders.length,
      totalProducts: prods.length,
      activeProducts: activeProducts.length,
      walletBalance: seller?.walletBalance || '0.00',
      totalSales: seller?.totalSales || '0.00',
      rating: seller?.rating || '5.00',
      reviewCount: seller?.reviewCount || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/sellers/:id/products", async (req, res) => {
  try {
    const sellerId = parseInt(req.params.id);
    if (!Number.isFinite(sellerId)) return res.status(400).json({ error: "Invalid seller id" });

    const access = await requireSellerAccessBySellerId(req, res, sellerId);
    if (!access) return;

    const tenantId = access.tenantId;

    const prods = await db
      .select()
      .from(sellerProducts)
      .where(
        and(eq(sellerProducts.sellerId, sellerId), eq(sellerProducts.tenantId, tenantId))
      )
      .orderBy(desc(sellerProducts.createdAt));
    res.json(prods);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/sellers/:id/orders", async (req, res) => {
  try {
    const sellerId = parseInt(req.params.id);
    if (!Number.isFinite(sellerId)) return res.status(400).json({ error: "Invalid seller id" });

    const access = await requireSellerAccessBySellerId(req, res, sellerId);
    if (!access) return;

    const tenantId = access.tenantId;
    const { status } = req.query;
    
    let orders;
    if (status) {
      orders = await db.select().from(marketplaceOrders)
        .where(
          and(
            eq(marketplaceOrders.sellerId, sellerId),
            eq(marketplaceOrders.status, status as any),
            eq(marketplaceOrders.tenantId, tenantId),
          ),
        )
        .orderBy(desc(marketplaceOrders.createdAt));
    } else {
      orders = await db.select().from(marketplaceOrders)
        .where(and(eq(marketplaceOrders.sellerId, sellerId), eq(marketplaceOrders.tenantId, tenantId)))
        .orderBy(desc(marketplaceOrders.createdAt));
    }
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/sellers/:id/transactions", async (req, res) => {
  try {
    const sellerId = parseInt(req.params.id);
    if (!Number.isFinite(sellerId)) return res.status(400).json({ error: "Invalid seller id" });

    const access = await requireSellerAccessBySellerId(req, res, sellerId);
    if (!access) return;

    const tenantId = access.tenantId;

    const transactions = await db.select().from(sellerWalletTransactions)
      .where(
        and(
          eq(sellerWalletTransactions.sellerId, sellerId),
          eq(sellerWalletTransactions.tenantId, tenantId),
        ),
      )
      .orderBy(desc(sellerWalletTransactions.createdAt))
      .limit(50);
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/sellers/:sellerId/products", async (req, res) => {
  try {
    const sellerId = parseInt(req.params.sellerId);
    if (!Number.isFinite(sellerId)) return res.status(400).json({ error: "Invalid seller id" });

    const access = await requireSellerAccessBySellerId(req, res, sellerId);
    if (!access) return;

    const tenant = access.tenant;
    const tenantId = access.tenantId;

    const data = req.body;

    const categoryId = Number(data?.categoryId);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return res.status(400).json({ error: "Primary category is required" });
    }

    const slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + nanoid(6);

    const nextAttributes = (() => {
      const attrsFromBody = data?.attributes;
      const base =
        attrsFromBody && typeof attrsFromBody === "object" && !Array.isArray(attrsFromBody) ? attrsFromBody : {};

      const videoUrl =
        typeof data?.videoUrl === "string"
          ? data.videoUrl
          : Array.isArray(data?.videos) && typeof data.videos[0] === "string"
            ? data.videos[0]
            : null;

      return videoUrl ? { ...base, videoUrl } : base;
    })();
    
    const [product] = await db.insert(sellerProducts).values({
      tenantId,
      sellerId,
      name: data.name,
      slug,
      description: data.description,
      shortDescription: data.shortDescription,
      price: data.price.toString(),
      compareAtPrice: data.compareAtPrice?.toString(),
      categoryId,
      sku: data.sku,
      stockQuantity: data.stockQuantity || 0,
      images: data.images,
      attributes: nextAttributes,
      isHandmade: data.isHandmade ?? true,
      productionTime: data.productionTime,
      ingredients: data.ingredients,
      tags: data.tags,
      status: 'draft',
    }).returning();

    const shouldAutoGenerate =
      !data.images || (Array.isArray(data.images) && data.images.length === 0);

    if (shouldAutoGenerate) {
      const captured = {
        tenantKey: String(tenant.key),
        tenantId,
        productId: product.id,
        categoryId: product.categoryId ? Number(product.categoryId) : null,
      };

      setImmediate(async () => {
        try {
          const category =
            captured.categoryId != null
              ? await db.query.productCategories.findFirst({
                  where: and(eq(productCategories.id, captured.categoryId), eq(productCategories.tenantId, captured.tenantId)),
                })
              : null;

          const { prompt, negativePrompt, aspect, modelTier } = buildProductPrompt({
            tenantKey: captured.tenantKey,
            product,
            category,
          });

          const [existing] = await db
            .select({ images: sellerProducts.images, attributes: sellerProducts.attributes })
            .from(sellerProducts)
            .where(and(eq(sellerProducts.id, captured.productId), eq(sellerProducts.tenantId, captured.tenantId)));

          const stillEmpty = !existing?.images || (Array.isArray(existing.images) && existing.images.length === 0);
          if (!stillEmpty) return;

          const categorySlug = category?.slug || "general";
          const preset = inferAutoImagePreset({
            tenantKey: captured.tenantKey,
            categorySlug,
            categoryName: category?.name,
            productName: product?.name,
            shortDescription: product?.shortDescription,
            description: product?.description,
          });
          const count = defaultAutoImageCount(preset);
          const desired = buildAnglePreset(preset, count);

          const baseAttrs =
            existing?.attributes && typeof existing.attributes === "object" && !Array.isArray(existing.attributes)
              ? (existing.attributes as any)
              : {};

          await db
            .update(sellerProducts)
            .set({
              attributes: {
                ...baseAttrs,
                imageGen: {
                  ...(typeof baseAttrs.imageGen === "object" && baseAttrs.imageGen && !Array.isArray(baseAttrs.imageGen) ? baseAttrs.imageGen : {}),
                  basePrompt: prompt,
                  negativePrompt,
                  preset,
                  updatedAt: new Date().toISOString(),
                },
              },
              updatedAt: new Date(),
            } as any)
            .where(and(eq(sellerProducts.id, captured.productId), eq(sellerProducts.tenantId, captured.tenantId)));

          const ensured = await ensureProductSlots({
            tenantId: captured.tenantId,
            tenantKey: captured.tenantKey,
            productId: captured.productId,
            categorySlug,
            desired,
          });

          const byAssetKey = new Map(ensured.slots.map((s: any) => [String(s.assetKey), s]));

          for (const slotDescriptor of desired) {
            const slotKey =
              slotDescriptor.slotKey === "primary"
                ? ensured.primaryAssetKey
                : `${captured.tenantKey}/${categorySlug}/${captured.productId}/${String(slotDescriptor.slotKey).toLowerCase()}`;
            const slot = byAssetKey.get(slotKey);
            if (!slot) continue;

            const angle = slotDescriptor.angle || "";
            const finalPrompt = angle ? `${prompt} | camera angle: ${angle} | consistent product, same design, same materials` : prompt;

            await generateAndStoreImage({
              namespace: "products",
              assetKey: String(slot.assetKey),
              prompt: finalPrompt,
              negativePrompt,
              mode: modelTier,
              input: { aspect_ratio: aspect, output_format: "png" },
              setActive: true,
            });
          }

          await syncProductImagesArray({
            tenantId: captured.tenantId,
            tenantKey: captured.tenantKey,
            productId: captured.productId,
            categorySlug,
          });
        } catch (err) {
          console.error("Auto product image generation failed", err);
        }
      });
    }
    
    res.status(201).json(product);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/shop-products", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;
    const lang = getRequestLanguage(req);
    const goldOnly = isGoldTenantKey(tenant.key);

    const { query, categoryId, minPrice, maxPrice, limit = "50", offset = "0" } = req.query;
    
    const conditions = [
      eq(sellerProducts.status, 'active'),
      eq(sellerProducts.tenantId, tenantId),
      eq(sellers.tenantId, tenantId),
    ];
    if (query) conditions.push(ilike(sellerProducts.name, `%${query}%`));
    if (categoryId) conditions.push(eq(sellerProducts.categoryId, parseInt(categoryId as string)));
    if (minPrice) conditions.push(gte(sellerProducts.price, minPrice as string));
    if (maxPrice) conditions.push(lte(sellerProducts.price, maxPrice as string));
    if (goldOnly) conditions.push(goldOnlyWhere());
    
    const productList = await db.select({
      product: sellerProducts,
      seller: sellers,
      category: productCategories,
    })
      .from(sellerProducts)
      .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
      .leftJoin(
        productCategories,
        and(eq(sellerProducts.categoryId, productCategories.id), eq(productCategories.tenantId, tenantId)),
      )
      .where(and(...conditions))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string))
      .orderBy(desc(sellerProducts.createdAt));

    res.json(
      productList.map((row) => ({
        ...row,
        product: {
          ...localizeSellerProduct(row.product as any, lang),
          images: absolutizeImageArray(req, row.product.images),
        },
      })),
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/shop-products/:id", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;
    const lang = getRequestLanguage(req);

    const [product] = await db
      .select()
      .from(sellerProducts)
      .where(and(eq(sellerProducts.id, parseInt(req.params.id)), eq(sellerProducts.tenantId, tenantId)));
    if (!product) return res.status(404).json({ error: "Product not found" });
    const localized = localizeSellerProduct(product as any, lang);
    res.json({ ...localized, images: absolutizeImageArray(req, (localized as any).images) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/shop-products/:id/suggest", async (req, res) => {
  const field = String(req.body?.field || "").trim();
  const allowed = new Set(["name", "shortDescription", "description", "tags"]);
  if (!allowed.has(field)) return res.status(400).json({ message: "Invalid field" });

  const draft = req.body?.draft && typeof req.body.draft === "object" && !Array.isArray(req.body.draft) ? req.body.draft : null;

  try {
    const productId = parseInt(req.params.id, 10);
    if (!Number.isFinite(productId)) return res.status(400).json({ message: "Invalid product id" });

    const access = await requireSellerAccessByProductId(req, res, productId);
    if (!access) return;

    const { tenant, tenantId, product, seller } = access;
    const mergedProduct = draft ? { ...product, ...draft } : product;

    const category =
      mergedProduct.categoryId != null
        ? await db.query.productCategories.findFirst({
            where: and(eq(productCategories.id, Number(mergedProduct.categoryId)), eq(productCategories.tenantId, tenantId)),
          })
        : null;

    const fallback = buildSellerProductSuggestionFallback({
      field,
      tenantKey: tenant.key,
      product: mergedProduct,
      category,
      seller,
    });

    if (!openai && !anthropic) {
      return res.json({ ok: false, value: fallback, reason: "AI_DISABLED" });
    }

    const requester = access.user;
    const requesterLabel = requester?.displayName || requester?.email || `seller:${requester?.id ?? "anon"}`;
    const languageHint = String(req.body?.language || "fr").trim();

    const context = {
      tenantKey: tenant.key,
      requester: requesterLabel,
      product: {
        id: mergedProduct.id,
        name: mergedProduct.name,
        slug: mergedProduct.slug,
        price: mergedProduct.price,
        currency: mergedProduct.currency,
        shortDescription: mergedProduct.shortDescription,
        description: mergedProduct.description,
        tags: mergedProduct.tags,
      },
      category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
      seller: seller ? { shopName: seller.shopName, sellerType: seller.sellerType, status: seller.status } : null,
    };

    const prompt = `You are helping a shop owner write premium, compliant marketplace product content.

Task:
- Suggest ONLY the value for the field: ${field}
- Output MUST be plain text only (no markdown, no JSON, no quotes)
- Keep language consistent with existing content. Default to French.
- Do not invent certifications, hallmarks, provenance claims, or legal guarantees.

Optional language hint: ${languageHint || "none"}

Context (JSON):
${JSON.stringify(context, null, 2)}

Constraints by field:
- name: concise, specific, no emoji
- shortDescription: 1 sentence, max ~160 chars
- description: 2-4 short paragraphs; short '-' bullet lines are allowed
- tags: comma-separated, 6-12 tags, no '#'
`;

    try {
      const text = await createChatCompletionText({
        system: "You are a premium marketplace copywriter helping a shop owner improve listing quality.",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 420,
        temperature: 0.35,
        sanitize: cleanModelText,
      });
      return res.json({ ok: true, value: cleanModelText(text) || fallback });
    } catch (err: any) {
      return res.json({ ok: false, value: fallback, reason: err?.message || "AI_FAILED" });
    }
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Suggest failed" });
  }
});

router.patch("/shop-products/:id", async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ error: "Invalid product id" });

    const access = await requireSellerAccessByProductId(req, res, productId);
    if (!access) return;

    const tenant = access.tenant;
    const tenantId = access.tenantId;
    const existingProduct = access.product as any;

    const body = (req.body || {}) as any;
    const { videoUrl, videos, ...rest } = body;

    const allowedFields = new Set([
      "name",
      "description",
      "shortDescription",
      "price",
      "compareAtPrice",
      "costPrice",
      "currency",
      "sku",
      "barcode",
      "stockQuantity",
      "lowStockThreshold",
      "trackInventory",
      "allowBackorder",
      "weight",
      "weightUnit",
      "dimensions",
      "isHandmade",
      "productionTime",
      "ingredients",
      "allergens",
      "certifications",
      "tags",
      "attributes",
      "status",
      "categoryId",
    ]);

    const sanitized: any = {};
    for (const [key, value] of Object.entries(rest)) {
      if (!allowedFields.has(key)) continue;
      sanitized[key] = value;
    }

    const next: any = { ...sanitized, updatedAt: new Date() };
    if (Object.prototype.hasOwnProperty.call(rest, "categoryId")) {
      const categoryId = Number((rest as any).categoryId);
      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        return res.status(400).json({ error: "Primary category is required" });
      }
      next.categoryId = categoryId;
    }
    const nextVideoUrl =
      typeof videoUrl === "string"
        ? videoUrl.trim()
        : Array.isArray(videos) && typeof videos[0] === "string"
          ? String(videos[0]).trim()
          : null;

    if (typeof videoUrl !== "undefined" || typeof videos !== "undefined") {
      const incomingAttrs =
        sanitized.attributes && typeof sanitized.attributes === "object" && !Array.isArray(sanitized.attributes)
          ? (sanitized.attributes as any)
          : null;

      const baseAttrs =
        incomingAttrs ||
        (existingProduct?.attributes && typeof existingProduct.attributes === "object" && !Array.isArray(existingProduct.attributes)
          ? (existingProduct.attributes as any)
          : {});

      if (nextVideoUrl) {
        next.attributes = { ...baseAttrs, videoUrl: nextVideoUrl };
      } else {
        const { videoUrl: _removed, ...restAttrs } = baseAttrs;
        next.attributes = restAttrs;
      }
    }

    const [updated] = await db
      .update(sellerProducts)
      .set(next)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)))
      .returning();
    res.json(updated);

    const shouldAutoGenerate =
      !updated?.images || (Array.isArray(updated.images) && updated.images.length === 0);
    if (shouldAutoGenerate) {
      const captured = {
        tenantKey: String(tenant.key),
        tenantId,
        productId,
        categoryId: updated?.categoryId ? Number(updated.categoryId) : null,
      };

      setImmediate(async () => {
        try {
          const category =
            captured.categoryId != null
              ? await db.query.productCategories.findFirst({
                  where: and(eq(productCategories.id, captured.categoryId), eq(productCategories.tenantId, captured.tenantId)),
                })
              : null;

          const { prompt, negativePrompt, aspect, modelTier } = buildProductPrompt({
            tenantKey: captured.tenantKey,
            product: updated,
            category,
          });

          const [existing] = await db
            .select({ images: sellerProducts.images, attributes: sellerProducts.attributes })
            .from(sellerProducts)
            .where(and(eq(sellerProducts.id, captured.productId), eq(sellerProducts.tenantId, captured.tenantId)));

          const stillEmpty = !existing?.images || (Array.isArray(existing.images) && existing.images.length === 0);
          if (!stillEmpty) return;

          const categorySlug = category?.slug || "general";
          const preset = inferAutoImagePreset({
            tenantKey: captured.tenantKey,
            categorySlug,
            categoryName: category?.name,
            productName: updated?.name,
            shortDescription: updated?.shortDescription,
            description: updated?.description,
          });
          const count = defaultAutoImageCount(preset);
          const desired = buildAnglePreset(preset, count);

          const baseAttrs =
            existing?.attributes && typeof existing.attributes === "object" && !Array.isArray(existing.attributes)
              ? (existing.attributes as any)
              : {};

          await db
            .update(sellerProducts)
            .set({
              attributes: {
                ...baseAttrs,
                imageGen: {
                  ...(typeof baseAttrs.imageGen === "object" && baseAttrs.imageGen && !Array.isArray(baseAttrs.imageGen) ? baseAttrs.imageGen : {}),
                  basePrompt: prompt,
                  negativePrompt,
                  preset,
                  updatedAt: new Date().toISOString(),
                },
              },
              updatedAt: new Date(),
            } as any)
            .where(and(eq(sellerProducts.id, captured.productId), eq(sellerProducts.tenantId, captured.tenantId)));

          const ensured = await ensureProductSlots({
            tenantId: captured.tenantId,
            tenantKey: captured.tenantKey,
            productId: captured.productId,
            categorySlug,
            desired,
          });

          const byAssetKey = new Map(ensured.slots.map((s: any) => [String(s.assetKey), s]));

          for (const slotDescriptor of desired) {
            const slotKey =
              slotDescriptor.slotKey === "primary"
                ? ensured.primaryAssetKey
                : `${captured.tenantKey}/${categorySlug}/${captured.productId}/${String(slotDescriptor.slotKey).toLowerCase()}`;
            const slot = byAssetKey.get(slotKey);
            if (!slot) continue;

            const angle = slotDescriptor.angle || "";
            const finalPrompt = angle ? `${prompt} | camera angle: ${angle} | consistent product, same design, same materials` : prompt;

            await generateAndStoreImage({
              namespace: "products",
              assetKey: String(slot.assetKey),
              prompt: finalPrompt,
              negativePrompt,
              mode: modelTier,
              input: { aspect_ratio: aspect, output_format: "png" },
              setActive: true,
            });
          }

          await syncProductImagesArray({
            tenantId: captured.tenantId,
            tenantKey: captured.tenantKey,
            productId: captured.productId,
            categorySlug,
          });
        } catch (err) {
          console.error("Auto product image generation failed", err);
        }
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/shop-products/:id", async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (!Number.isFinite(productId)) return res.status(400).json({ error: "Invalid product id" });

    const access = await requireSellerAccessByProductId(req, res, productId);
    if (!access) return;

    const tenantId = access.tenantId;

    await db
      .delete(sellerProducts)
      .where(and(eq(sellerProducts.id, productId), eq(sellerProducts.tenantId, tenantId)));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/dashboard/stats", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const allSellers = await db.select().from(sellers).where(eq(sellers.tenantId, tenantId));
    const allProducts = await db.select().from(sellerProducts).where(eq(sellerProducts.tenantId, tenantId));
    const allOrders = await db.select().from(marketplaceOrders).where(eq(marketplaceOrders.tenantId, tenantId));
    
    const approvedSellers = allSellers.filter(s => s.status === 'approved');
    const pendingSellers = allSellers.filter(s => s.status === 'pending');
    const activeProducts = allProducts.filter(p => p.status === 'active');
    const completedOrders = allOrders.filter(o => o.status === 'delivered');
    
    const totalRevenue = completedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    
    res.json({
      sellers: {
        total: allSellers.length,
        approved: approvedSellers.length,
        pending: pendingSellers.length,
      },
      products: {
        total: allProducts.length,
        active: activeProducts.length,
      },
      orders: {
        total: allOrders.length,
        completed: completedOrders.length,
      },
      revenue: {
        total: totalRevenue,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/demo/create-seller", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    
    const [existingSeller] = await db
      .select()
      .from(sellers)
      .where(and(eq(sellers.userId, userId), eq(sellers.tenantId, tenantId)));
    if (existingSeller) {
      return res.json(existingSeller);
    }
    
    const slug = "demo-gold-shop-" + nanoid(6);
    
    const [seller] = await db.insert(sellers).values({
      tenantId,
      userId,
      shopName: "Demo Gold Seller",
      slug,
      description: "Demo gold seller for testing: stamped pieces, dore lots, and heritage items.",
      phoneNumber: '+225 00 00 00 00',
      email: "demo@boursedelor.com",
      productionType: "gold_retail",
      status: 'approved',
      approvedAt: new Date(),
      isProducer: false,
      isDemo: true,
    }).returning();
    
    const categories = await db
      .select()
      .from(productCategories)
      .where(inArray(productCategories.slug, [...GOLD_CATEGORY_SLUGS]))
      .limit(10);

    const bySlug = new Map<string, any>();
    categories.forEach((c: any) => bySlug.set(String(c.slug), c));
    const stampedCategory = bySlug.get("stamped");
    const jewelryCategory = bySlug.get("jewelry");
    const doreCategory = bySlug.get("dore");
    
    await db.insert(sellerProducts).values({
      tenantId,
      sellerId: seller.id,
      name: "Stamped Gold Piece - 20g (22K)",
      slug: "stamped-gold-20g-22k-" + nanoid(6),
      description: "Stamped 22K gold piece (20g) with certification. Retail-ready for secure delivery or custody.",
      price: "60000",
      stockQuantity: 35,
      isHandmade: false,
      productionTime: "Same day",
      categoryId: stampedCategory?.id,
      weight: "20",
      weightUnit: "g",
      images: ["/product-images/stamped-bar-01.png", "/product-images/stamped-piece-01.png", "/product-images/gold-card.png"],
      tags: ["gold", "stamped", "22k"],
      status: 'active',
    });
    
    await db.insert(sellerProducts).values({
      tenantId,
      sellerId: seller.id,
      name: "Gold Art Object - Heritage Series",
      slug: "gold-art-heritage-" + nanoid(6),
      description: "Curated gold art / heritage object with certificate. Secure delivery available.",
      price: "2600000",
      stockQuantity: 3,
      isHandmade: true,
      productionTime: "2-5 days",
      categoryId: jewelryCategory?.id,
      weight: "85",
      weightUnit: "g",
      images: ["/product-images/art-ceremonial.png", "/product-images/art-bust.png", "/product-images/art-medallion.png"],
      tags: ["gold", "heritage", "art"],
      status: 'active',
    });
    
    await db.insert(sellerProducts).values({
      tenantId,
      sellerId: seller.id,
      name: "Gold Doré Lot - Standard Grade",
      slug: "dore-lot-standard-" + nanoid(6),
      description: "Doré lot available in grams. Compliance and verification required. Sold by Bourse de l'Or.",
      price: "74000",
      stockQuantity: 10,
      isHandmade: false,
      categoryId: doreCategory?.id,
      weight: "100",
      weightUnit: "g",
      images: ["/product-images/dore-lot-01.png", "/product-images/dore-nuggets-01.png", "/product-images/dore-nuggets-02.png"],
      tags: ["gold", "dore", "wholesale"],
      status: 'active',
    });
    
    res.status(201).json(seller);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

router.get("/buyer/wallet", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const guestSessionId = req.headers['x-guest-session'] as string;
    const authHeader = req.headers.authorization;
    
    let wallet = null;
    let userId = null;
    let isAuthenticated = false;
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const session = await db.query.eceSessions.findFirst({
          where: eq(eceSessions.token, token)
        });
        if (session && new Date(session.expiresAt) > new Date()) {
          userId = session.userId;
          isAuthenticated = true;
          wallet = await db.query.buyerWallets.findFirst({
            where: and(eq(buyerWallets.userId, userId), eq(buyerWallets.tenantId, tenantId))
          });
        }
      } catch (tokenError) {
        console.error("[Buyer] Token validation error:", tokenError);
      }
    }
    
    if (!wallet && guestSessionId) {
      try {
        wallet = await db.query.buyerWallets.findFirst({
          where: and(eq(buyerWallets.visitorId, guestSessionId), eq(buyerWallets.tenantId, tenantId))
        });
      } catch (guestError) {
        console.error("[Buyer] Guest wallet lookup error:", guestError);
      }
    }
    
    if (!wallet) {
      const visitorId = guestSessionId || `guest-${nanoid()}`;
      try {
        const [newWallet] = await db.insert(buyerWallets).values({
          tenantId,
          visitorId: userId ? null : visitorId,
          userId: userId || null,
          balance: "0.00",
          currency: "XOF"
        }).returning();
        wallet = newWallet;
      } catch (createError) {
        console.error("[Buyer] Wallet creation error:", createError);
        return res.json({
          wallet: {
            id: null,
            balance: "0.00",
            currency: "XOF",
            totalDeposited: "0.00",
            totalSpent: "0.00"
          },
          recentTransactions: [],
          isGuest: !isAuthenticated
        });
      }
    }
    
    let recentTransactions: any[] = [];
    try {
      recentTransactions = await db.select()
        .from(buyerWalletTransactions)
        .where(and(eq(buyerWalletTransactions.walletId, wallet.id), eq(buyerWalletTransactions.tenantId, tenantId)))
        .orderBy(desc(buyerWalletTransactions.createdAt))
        .limit(5);
    } catch (txError) {
      console.error("[Buyer] Transaction lookup error:", txError);
    }
    
    res.json({
      wallet: {
        id: wallet.id,
        balance: wallet.balance || "0.00",
        currency: wallet.currency || "XOF",
        totalDeposited: wallet.totalDeposited || "0.00",
        totalSpent: wallet.totalSpent || "0.00"
      },
      recentTransactions,
      isGuest: !isAuthenticated
    });
  } catch (error: any) {
    console.error("[Buyer] Wallet error:", error);
    res.json({
      wallet: {
        id: null,
        balance: "0.00",
        currency: "XOF",
        totalDeposited: "0.00",
        totalSpent: "0.00"
      },
      recentTransactions: [],
      error: error.message
    });
  }
});

router.post("/buyer/wallet/transfer", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const { recipientEmail, amount, note } = req.body;
    
    const session = (req as any).session as any;
    const userId = session?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: "You must be logged in to transfer credits" });
    }
    
    if (!recipientEmail || !amount) {
      return res.status(400).json({ error: "Recipient email and amount are required" });
    }
    
    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ error: "Invalid transfer amount" });
    }
    
    if (transferAmount < 100) {
      return res.status(400).json({ error: "Minimum transfer amount is 100 XOF" });
    }
    
    const senderWallet = await db.query.buyerWallets.findFirst({
      where: and(eq(buyerWallets.userId, userId), eq(buyerWallets.tenantId, tenantId))
    });
    
    if (!senderWallet) {
      return res.status(400).json({ error: "You don't have a wallet yet" });
    }
    
    const senderBalance = parseFloat(senderWallet.balance || "0");
    if (senderBalance < transferAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    
    const recipient = await db.query.users.findFirst({
      where: eq(users.email, recipientEmail.toLowerCase().trim())
    });
    
    if (!recipient) {
      return res.status(404).json({ error: "Recipient not found. They must be registered on the platform." });
    }
    
    if (recipient.id === userId) {
      return res.status(400).json({ error: "You cannot transfer to yourself" });
    }
    
    let recipientWallet = await db.query.buyerWallets.findFirst({
      where: and(eq(buyerWallets.userId, recipient.id), eq(buyerWallets.tenantId, tenantId))
    });
    
    if (!recipientWallet) {
      const [newWallet] = await db.insert(buyerWallets).values({
        tenantId,
        userId: recipient.id,
        balance: "0.00",
        currency: "XOF"
      }).returning();
      recipientWallet = newWallet;
    }
    
    const senderNewBalance = (senderBalance - transferAmount).toFixed(2);
    const recipientOldBalance = parseFloat(recipientWallet.balance || "0");
    const recipientNewBalance = (recipientOldBalance + transferAmount).toFixed(2);
    
    await db.update(buyerWallets)
      .set({ balance: senderNewBalance })
      .where(and(eq(buyerWallets.id, senderWallet.id), eq(buyerWallets.tenantId, tenantId)));
    
    await db.update(buyerWallets)
      .set({ 
        balance: recipientNewBalance,
        totalDeposited: ((parseFloat(recipientWallet.totalDeposited || "0") + transferAmount).toFixed(2))
      })
      .where(and(eq(buyerWallets.id, recipientWallet.id), eq(buyerWallets.tenantId, tenantId)));
    
    await db.insert(buyerWalletTransactions).values({
      tenantId,
      walletId: senderWallet.id,
      type: "transfer_out",
      amount: (-transferAmount).toFixed(2),
      balanceBefore: senderBalance.toFixed(2),
      balanceAfter: senderNewBalance,
      description: note ? `Transfer to ${recipient.email}: ${note}` : `Transfer to ${recipient.email}`,
      paymentMethod: "platform_transfer",
      status: "completed"
    });
    
    await db.insert(buyerWalletTransactions).values({
      tenantId,
      walletId: recipientWallet.id,
      type: "transfer_in",
      amount: transferAmount.toFixed(2),
      balanceBefore: recipientOldBalance.toFixed(2),
      balanceAfter: recipientNewBalance,
      description: `Received from ${session.user.email}` + (note ? `: ${note}` : ""),
      paymentMethod: "platform_transfer",
      status: "completed"
    });
    
    res.json({
      success: true,
      message: `Successfully sent ${transferAmount.toLocaleString()} XOF to ${recipient.displayName || recipient.email}`,
      newBalance: senderNewBalance,
      transfer: {
        amount: transferAmount,
        recipient: {
          email: recipient.email,
          name: recipient.displayName
        },
        note
      }
    });
  } catch (error: any) {
    console.error("[Wallet] Transfer error:", error);
    res.status(500).json({ error: "Transfer failed. Please try again." });
  }
});

router.get("/buyer/wallet/search-users", async (req, res) => {
  try {
    const { q } = req.query;
    const session = (req as any).session as any;
    const userId = session?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.json({ users: [] });
    }
    
    const searchQuery = `%${q.toLowerCase()}%`;
    const matchingUsers = await db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
      .from(users)
      .where(
        and(
          or(
            sql`lower(${users.email}) LIKE ${searchQuery}`,
            sql`lower(${users.displayName}) LIKE ${searchQuery}`
          ),
          sql`${users.id} != ${userId}`
        )
      )
      .limit(5);
    
    const isDemo = isDemoModeRequest(req);
    const responseUsers = isDemo
      ? matchingUsers.map((u) => ({
          ...u,
          displayName: u.displayName ? demoPersonName(u.id) : u.displayName,
        }))
      : matchingUsers;

    res.json({ users: responseUsers });
  } catch (error: any) {
    console.error("[Wallet] Search users error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/buyer/nearby", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const dataTenant = await resolveMarketplaceDataTenant(tenant);
    res.setHeader("Cache-Control", "private, max-age=15");
    const tenantId = dataTenant.id;
    const lang = getRequestLanguage(req);
    const goldOnly = isGoldTenantKey(dataTenant.key);
    const token = req.headers.authorization?.replace("Bearer ", "");
    const viewer = token ? await verifySession(token) : null;
    const isAdminViewer = isEceAdmin(viewer);

    const { lat, lng, radius = "10", category } = req.query;
    const userLat = parseFloat(lat as string) || 5.349;
    const userLng = parseFloat(lng as string) || -4.017;
    const radiusKm = parseFloat(radius as string);

    const allowedSellerStatuses = goldOnly
      ? (["approved"] as const)
      : isAdminViewer
        ? (["approved", "verified", "pending"] as const)
        : (["approved", "verified"] as const);
    
    const approvedSellersRaw = await db
      .select({
        seller: sellers,
        cityName: geoCities.name,
        countryName: geoCountries.name,
        countryCode: geoCountries.code,
      })
      .from(sellers)
      .leftJoin(geoCities, eq(sellers.cityId, geoCities.id))
      .leftJoin(geoCountries, eq(sellers.countryId, geoCountries.id))
      .where(and(inArray(sellers.status, allowedSellerStatuses as any), eq(sellers.tenantId, tenantId)));

    const showJewelersOnMap = await isMapShowJewelersEnabled(tenant.key);

    // Feature-flagged safety control: allow hiding jeweler pins during staged rollout / emergency.
    const approvedSellers = approvedSellersRaw.filter((row) => {
      const seller = row.seller;
      const isJeweler = seller.sellerType === "jeweler" || seller.productionType === "jewelry_manufacturing";
      if (!isJeweler) return true;
      if (!showJewelersOnMap) return false;

      const sellerLat = parseFloat(seller.latitude?.toString() || "");
      const sellerLng = parseFloat(seller.longitude?.toString() || "");
      if (!Number.isFinite(sellerLat) || !Number.isFinite(sellerLng)) return false;
      if (Math.abs(sellerLat) > 90 || Math.abs(sellerLng) > 180) return false;
      if (sellerLat === 0 && sellerLng === 0) return false;

      return true;
    });
    
    const uniqueSellers = new Map<number, (typeof approvedSellers)[0]>();
    approvedSellers.forEach((row) => {
      uniqueSellers.set(row.seller.id, row);
    });
    const categorySlug = typeof category === "string" ? category.trim().toLowerCase() : null;
    const markerStyles = await loadActiveMarkerStyles(tenantId);

    const sellerRows = Array.from(uniqueSellers.values()).map((row) => {
      const seller = row.seller;
      const sellerLat = parseFloat(seller.latitude?.toString() || "0");
      const sellerLng = parseFloat(seller.longitude?.toString() || "0");
      const distance = sellerLat && sellerLng ? calculateDistance(userLat, userLng, sellerLat, sellerLng) : null;

      return {
        row,
        seller,
        distance,
      };
    });

	    const sortByDistanceTrust = (a: any, b: any) => {
	      const ad = a.distance ?? 999;
	      const bd = b.distance ?? 999;
	      if (ad !== bd) return ad - bd;
	      const av = a.verifiedAt || a.seller?.verifiedAt ? 1 : 0;
	      const bv = b.verifiedAt || b.seller?.verifiedAt ? 1 : 0;
	      return bv - av;
	    };

	    const radiusFilterEnabled = Number.isFinite(radiusKm) && radiusKm > 0;
      const radiusKmSafe = radiusFilterEnabled ? Math.min(Math.max(radiusKm, 0), 20000) : 10;

      const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
        const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
        const n = Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
      };

      const requestedShopsLimit = req.query?.limit ?? req.query?.maxShops ?? req.query?.shops;
      const requestedProductsPerSeller =
        req.query?.productsPerSeller ?? req.query?.perSeller ?? req.query?.products ?? req.query?.perShop;

      const defaultShopsLimit =
        radiusKmSafe >= 1000 ? 500 : radiusKmSafe >= 500 ? 300 : radiusKmSafe >= 200 ? 200 : radiusKmSafe >= 100 ? 150 : 50;
      const shopsLimit = clampInt(requestedShopsLimit, 10, 1000, defaultShopsLimit);

      const defaultProductsPerSeller = radiusKmSafe >= 500 ? 80 : 50;
      const productsPerSeller = clampInt(requestedProductsPerSeller, 6, 2000, defaultProductsPerSeller);

    const allowedProductStatuses = isAdminViewer ? (["active", "draft"] as const) : (["active"] as const);

    // When a category is selected, we must not "lose" sellers that carry that category just because
    // they're far away (or because the platform has many sellers). First scope candidate sellers
    // to those that actually have matching products, then sort by distance/trust.
    const categorySellerIdSet =
      categorySlug
        ? new Set(
            (
              await db
                .select({ sellerId: sellerProducts.sellerId })
                .from(sellerProducts)
                .leftJoin(
                  productCategories,
                  and(eq(sellerProducts.categoryId, productCategories.id), eq(productCategories.tenantId, tenantId)),
                )
                .where(
                  and(
                    eq(sellerProducts.tenantId, tenantId),
                    inArray(sellerProducts.status, allowedProductStatuses as any),
                    ...(goldOnly && (GOLD_CATEGORY_SLUGS as readonly string[]).includes(categorySlug)
                      ? [goldCategoryFilterWhere(categorySlug)]
                      : [eq(productCategories.slug, categorySlug)]),
                    ...(goldOnly ? [goldOnlyWhere()] : []),
                  ),
                )
                .groupBy(sellerProducts.sellerId)
                .limit(20000)
            )
              .map((r) => Number(r.sellerId))
              .filter((id) => Number.isFinite(id)),
          )
        : null;

    const sortedSellers = [...sellerRows].sort(sortByDistanceTrust);
    const scopedSellers = categorySellerIdSet ? sortedSellers.filter((s) => categorySellerIdSet.has(s.seller.id)) : sortedSellers;

    const maxCandidateSellers =
      Math.min(scopedSellers.length <= 1000 ? scopedSellers.length : Math.max(shopsLimit * 25, 500), 5000);
    const candidateSellerRows = scopedSellers.slice(0, maxCandidateSellers);
    const candidateSellerIds = candidateSellerRows.map((s) => s.seller.id);
    const maxProductRows = Math.min(candidateSellerIds.length * productsPerSeller, 50_000);

    const productOrderBy =
      goldOnly && !categorySlug
        ? ([
            sql`CASE
              WHEN ${productCategories.slug} = 'gold-art' THEN 0
              WHEN ${productCategories.slug} = 'jewelry' THEN 1
              WHEN ${productCategories.slug} = 'stamped' THEN 2
              WHEN ${productCategories.slug} = 'dore' THEN 3
              ELSE 4
            END`,
            desc(sellerProducts.createdAt),
          ] as any[])
        : ([desc(sellerProducts.createdAt)] as any[]);
      const productRows = candidateSellerIds.length
      ? await db
          .select({
            product: sellerProducts,
            category: productCategories,
          })
          .from(sellerProducts)
          .leftJoin(
            productCategories,
            and(eq(sellerProducts.categoryId, productCategories.id), eq(productCategories.tenantId, tenantId)),
          )
          .where(
            and(
              inArray(sellerProducts.sellerId, candidateSellerIds),
              inArray(sellerProducts.status, allowedProductStatuses as any),
              eq(sellerProducts.tenantId, tenantId),
              ...(categorySlug
                ? [
                    goldOnly && (GOLD_CATEGORY_SLUGS as readonly string[]).includes(categorySlug)
                      ? goldCategoryFilterWhere(categorySlug)
                      : eq(productCategories.slug, categorySlug),
                  ]
                : []),
              ...(goldOnly ? [goldOnlyWhere()] : []),
            ),
          )
          .orderBy(...(productOrderBy as any))
          .limit(maxProductRows)
      : [];

    const productsBySellerId = new Map<number, (typeof productRows)>();

    for (const p of productRows) {
      const sellerId = Number(p.product.sellerId);
      if (!Number.isFinite(sellerId)) continue;

      const existing = productsBySellerId.get(sellerId) ?? [];
      if (existing.length >= productsPerSeller) continue;
      if (goldOnly) {
        const mismatch = shouldBlockGoldCategoryMismatch({
          categorySlug: p.category?.slug ?? null,
          product: p.product,
        });
        if (mismatch) {
          void logMarketplaceIntegrityOnce({
            req,
            tenantId,
            entityType: "product",
            entityId: Number(p.product?.id) || null,
            action: "marketplace.integrity.blocked_product",
            metadata: {
              ...mismatch.details,
              sellerId,
              sellerType: (candidateSellerRows.find((s) => s.seller.id === sellerId)?.seller as any)?.sellerType,
              categorySlug: p.category?.slug ?? null,
            },
          });
          continue;
        }
      }

      existing.push(p);
      productsBySellerId.set(sellerId, existing);
    }

    const sellersWithProducts = sellerRows
      .map((s) => {
      const rows = productsBySellerId.get(s.seller.id) ?? [];
      const visibleProducts = rows.slice(0, productsPerSeller);
        if (visibleProducts.length === 0) return null;

        const productMarkerKey =
          visibleProducts
            .map((p) => normalizeMarkerStyleKey((p as any)?.category?.mapMarkerKey))
            .find((key) => !!key && markerStyles.byKey.has(key)) || null;
        const shopMarkerKey = normalizeMarkerStyleKey((s.seller as any)?.mapMarkerKey);
        const resolvedMarkerKey =
          productMarkerKey ||
          (shopMarkerKey && markerStyles.byKey.has(shopMarkerKey) ? shopMarkerKey : null) ||
          "shop_default";
        const resolvedMarkerStyle = markerStyles.byKey.get(resolvedMarkerKey) || markerStyles.defaultStyle;

        return {
          ...s.seller,
          cityName: s.row.cityName ?? null,
          countryName: s.row.countryName ?? null,
          countryCode: s.row.countryCode ?? null,
          distance: s.distance,
          distanceText: s.distance ? `${s.distance.toFixed(1)} km` : null,
          deliveryEta: s.distance ? Math.round(20 + s.distance * 3) : null,
          mapMarkerKey: resolvedMarkerKey,
          mapMarkerStyle: resolvedMarkerStyle,
          products: visibleProducts.map((p) => {
            const localized = localizeSellerProduct((p.product as any) ?? {}, lang);
            return {
              ...localized,
              images: absolutizeImageArray(req, (localized as any).images),
              categoryName: p.category?.name,
              categorySlug: p.category?.slug,
              categoryIcon: p.category?.icon,
              categoryColor: p.category?.color,
              categoryMapMarkerKey: normalizeMarkerStyleKey((p.category as any)?.mapMarkerKey) || null,
              videoUrl:
                typeof (localized as any)?.attributes?.videoUrl === "string"
                  ? (localized as any).attributes.videoUrl
                  : Array.isArray((localized as any)?.attributes?.videos) &&
                      typeof (localized as any).attributes.videos[0] === "string"
                    ? (localized as any).attributes.videos[0]
                    : null,
            };
          }),
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

	    const allCandidates = sellersWithProducts;
	    const withinRadius = radiusFilterEnabled ? allCandidates.filter((s) => s.distance === null || s.distance <= radiusKm) : allCandidates;
	    const withinRadiusCount = withinRadius.length;
	
	    const sortedWithinRadius = [...withinRadius].sort(sortByDistanceTrust);
	    const sortedAll = [...allCandidates].sort(sortByDistanceTrust);
	
	    const usedFallback = radiusFilterEnabled && withinRadiusCount === 0 && allCandidates.length > 0;
	    const selected = usedFallback ? sortedAll : sortedWithinRadius;
	
	    const isDemo = isDemoModeRequest(req);
	    const shops = selected.slice(0, shopsLimit).map((shop: any) => {
	      if (!isDemo) return shop;
	      return {
	        ...shop,
        shopName: demoCompanyName(shop.id, "seller"),
        description: "Fictional demo seller (names and contacts are anonymized).",
        phoneNumber: null,
        email: null,
	        website: null,
	        streetAddress: null,
	        openingHours: null,
	      };
	    });

      try {
        const missing: Array<{ id: number; categorySlug?: string | null }> = [];
        for (const shop of shops as any[]) {
          const products = Array.isArray(shop?.products) ? shop.products : [];
          for (const product of products) {
            const hasImage = !!pickFirstImageUrl((product as any)?.images);
            if (hasImage) continue;
            missing.push({ id: Number(product?.id), categorySlug: (product as any)?.categorySlug ?? null });
          }
        }

        if (missing.length) {
          const fallbackById = await resolveProductCardImageFallbacks(req, {
            tenantId,
            tenantKey: String(tenant.key),
            products: missing,
          });

          for (const shop of shops as any[]) {
            const products = Array.isArray(shop?.products) ? shop.products : [];
            for (const product of products) {
              const id = Number(product?.id);
              if (!Number.isFinite(id)) continue;
              if (pickFirstImageUrl((product as any)?.images)) continue;
              const url = fallbackById.get(id);
              if (url) product.images = [url];
            }
          }
        }
      } catch {
        // ignore image fallback failures
      }

	    res.json({
	      shops,
        mapMarkerStyles: markerStyles.rows,
	      userLocation: { lat: userLat, lng: userLng },
	      radius: radiusKm,
        limits: { shops: shopsLimit, productsPerSeller },
	      fallback: {
	        used: usedFallback,
	        reason: usedFallback ? "no_results_within_radius" : null,
	        withinRadiusCount,
	        totalCount: allCandidates.length,
	      },
	    });
	  } catch (error: any) {
	    console.error("[Buyer] Nearby error:", error);
	    res.status(500).json({ error: error.message });
	  }
});

router.get("/buyer/feed", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const dataTenant = await resolveMarketplaceDataTenant(tenant);
    res.setHeader("Cache-Control", "private, max-age=30");
    const tenantId = dataTenant.id;
    const lang = getRequestLanguage(req);
    const goldOnly = isGoldTenantKey(dataTenant.key);
    const token = req.headers.authorization?.replace("Bearer ", "");
    const viewer = token ? await verifySession(token) : null;
    const isAdminViewer = isEceAdmin(viewer);
    const allowedSellerStatuses = goldOnly
      ? (["approved"] as const)
      : isAdminViewer
        ? (["approved", "verified", "pending"] as const)
        : (["approved", "verified"] as const);

    const { lat, lng } = req.query;
    const userLat = parseFloat(lat as string) || 5.349;
    const userLng = parseFloat(lng as string) || -4.017;
    const markerStyles = await loadActiveMarkerStyles(tenantId);
    
    const categories = await db
      .select()
      .from(productCategories)
      .where(
        buildWhere([
          eq(productCategories.isActive, true),
          eq(productCategories.tenantId, tenantId),
          goldOnly ? inArray(productCategories.slug, [...GOLD_CATEGORY_SLUGS]) : undefined,
        ]) ?? sql`TRUE`,
      )
      .orderBy(asc(productCategories.sortOrder));
    
    const recentProducts = await db.select({
      product: sellerProducts,
      seller: sellers,
      category: productCategories,
    })
      .from(sellerProducts)
      .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
      .leftJoin(
        productCategories,
        and(eq(sellerProducts.categoryId, productCategories.id), eq(productCategories.tenantId, tenantId)),
      )
      .where(and(
        eq(sellerProducts.status, 'active'),
        inArray(sellers.status, allowedSellerStatuses as any),
        eq(sellerProducts.tenantId, tenantId),
        eq(sellers.tenantId, tenantId),
        ...(goldOnly ? [goldOnlyWhere()] : [])
      ))
      .orderBy(desc(sellerProducts.createdAt))
      .limit(30);
    
    const popularProducts = await db.select({
      product: sellerProducts,
      seller: sellers,
      category: productCategories,
    })
      .from(sellerProducts)
      .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
      .leftJoin(
        productCategories,
        and(eq(sellerProducts.categoryId, productCategories.id), eq(productCategories.tenantId, tenantId)),
      )
      .where(and(
        eq(sellerProducts.status, 'active'),
        inArray(sellers.status, allowedSellerStatuses as any),
        eq(sellerProducts.tenantId, tenantId),
        eq(sellers.tenantId, tenantId),
        ...(goldOnly ? [goldOnlyWhere()] : [])
      ))
      .orderBy(desc(sellerProducts.totalSold))
      .limit(30);
    
    const isDemo = isDemoModeRequest(req);

    const needsFallback = [...recentProducts, ...popularProducts].filter((item: any) => {
      const normalized = absolutizeImageArray(req, item?.product?.images);
      return !pickFirstImageUrl(normalized);
    });

    const fallbackById = needsFallback.length
      ? await resolveProductCardImageFallbacks(req, {
          tenantId,
          tenantKey: String(tenant.key),
          products: needsFallback.map((item: any) => ({
            id: Number(item?.product?.id),
            categorySlug: item?.category?.slug ?? null,
          })),
        })
      : new Map<number, string>();

    const formatProduct = (item: any) => {
      if (goldOnly) {
        const mismatch = shouldBlockGoldCategoryMismatch({ categorySlug: item.category?.slug ?? null, product: item.product });
        if (mismatch) {
          void logMarketplaceIntegrityOnce({
            req,
            tenantId,
            entityType: "product",
            entityId: Number(item.product?.id) || null,
            action: "marketplace.integrity.blocked_product",
            metadata: {
              ...mismatch.details,
              sellerId: item.seller?.id ?? null,
              sellerType: item.seller?.sellerType ?? null,
              categorySlug: item.category?.slug ?? null,
            },
          });
          return null;
        }
      }

      const localizedProduct = localizeSellerProduct((item.product as any) ?? {}, lang);

      const sellerLat = parseFloat(item.seller?.latitude?.toString() || "0");
      const sellerLng = parseFloat(item.seller?.longitude?.toString() || "0");
      const distance = sellerLat && sellerLng 
        ? calculateDistance(userLat, userLng, sellerLat, sellerLng)
        : null;

      const attrs = (localizedProduct as any)?.attributes as any;
      const videoUrl =
        typeof attrs?.videoUrl === "string"
          ? attrs.videoUrl
          : Array.isArray(attrs?.videos) && typeof attrs.videos[0] === "string"
            ? attrs.videos[0]
            : null;

      const normalizedImages = absolutizeImageArray(req, (localizedProduct as any)?.images);
      const resolvedImage =
        pickFirstImageUrl(normalizedImages) ||
        (Number.isFinite(Number((localizedProduct as any)?.id)) ? fallbackById.get(Number((localizedProduct as any).id)) : null) ||
        null;
      
      return {
        id: (localizedProduct as any).id,
        name: (localizedProduct as any).name,
        description: (localizedProduct as any).description,
        price: (localizedProduct as any).price,
        totalSold: (localizedProduct as any).totalSold ?? 0,
        weight: (localizedProduct as any).weight,
        weightUnit: (localizedProduct as any).weightUnit,
        currency: (localizedProduct as any).currency || 'XOF',
        image: resolvedImage ? (toPublicUrl(req, resolvedImage) ?? resolvedImage) : null,
        images: Array.isArray(normalizedImages)
          ? normalizedImages
          : resolvedImage
            ? [resolvedImage]
            : [],
        tags: (localizedProduct as any)?.tags ?? null,
        videoUrl,
        shopName: isDemo && item.seller?.id ? demoCompanyName(item.seller.id, "seller") : item.seller?.shopName,
        shopId: item.seller?.id,
        shopSlug: item.seller?.slug,
        categoryName: item.category?.name,
        categorySlug: item.category?.slug,
        categoryIcon: item.category?.icon,
        categoryColor: item.category?.color,
        distance,
        distanceText: distance ? `${distance.toFixed(1)} km` : null,
        deliveryEta: distance ? `~${Math.round(20 + distance * 3)} min` : null,
        isVerifiedSeller: !!item.seller?.verifiedAt,
        stockQuantity: item.product.stockQuantity || 0,
        inStock: (item.product.stockQuantity || 0) > 0,
      };
    };

    const sortByProximityTrust = (a: any, b: any) => {
      const ad = a.distance ?? Number.POSITIVE_INFINITY;
      const bd = b.distance ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      if (!!a.isVerifiedSeller !== !!b.isVerifiedSeller) return a.isVerifiedSeller ? -1 : 1;
      return 0;
    };

    const aroundYou = recentProducts
      .map(formatProduct)
      .filter(Boolean)
      .sort(sortByProximityTrust)
      .slice(0, 12);
    const popular = popularProducts
      .map(formatProduct)
      .filter(Boolean)
      .sort(sortByProximityTrust)
      .slice(0, 8);
    
    res.json({
      categories: categories.map((c: any) => {
        const mapMarkerKey = normalizeMarkerStyleKey(c?.mapMarkerKey) || "shop_default";
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          color: c.color,
          mapMarkerKey,
          mapMarkerStyle: markerStyles.byKey.get(mapMarkerKey) || markerStyles.defaultStyle,
        };
      }),
      mapMarkerStyles: markerStyles.rows,
      sections: [
        {
          id: 'around-you',
          title: 'Around you right now',
          subtitle: 'Fresh finds nearby',
          products: aroundYou,
        },
        {
          id: 'popular',
          title: 'Top picks from nearby shops',
          subtitle: 'Popular with locals',
          products: popular,
        }
      ]
    });
  } catch (error: any) {
    console.error("[Buyer] Feed error:", error);
    res.status(500).json({ error: error.message });
  }
});

const BUYER_ASSISTANT_PROMPT = `You are the Bourse de l’Or AI Concierge (merchant-of-record).

${BDO_POLICY_SNIPPET}

YOUR CAPABILITIES:
1. Help users discover gold products and gold services only (dore lots, stamped bars in grams, jewelry/heritage items, virtual vault, delivery, authorized resale)
2. Recommend gold products based on needs, location, and budget
3. Add gold products to cart and guide through checkout
4. Explain purity, provenance, certifications, and pricing per gram

RESPONSE FORMAT - Use JSON with actions:
{
  "message": "Your conversational response",
  "intent": "search" | "order" | "checkout" | "info" | "chat",
  "searchTerms": ["term1"] (for product search),
  "quantityIntent": "Optional: quantity/intent (e.g., '500kg monthly', '10 units', 'bulk purchase')",
  "urgency": "Optional: low | medium | high",
  "qualityNotes": "Optional: quality/certification requirements",
  "actions": [
    {"type": "ADD_TO_CART", "productId": 5, "productName": "Exact product name", "quantity": 1},
    {"type": "START_CHECKOUT"},
    {"type": "VIEW_PRODUCT", "productId": 3, "productName": "Exact product name"}
  ]
}

IMPORTANT:
- Return ONLY the JSON object (no markdown, no code fences)
- Do not prefix the response with "json"
- Never claim you added/removed/updated the cart unless you include the matching action

ACTION TYPES:
- ADD_TO_CART: When user wants to buy something, add it
- SET_CART_QUANTITY: Set an exact quantity for an item already in cart
- REMOVE_FROM_CART: Remove an item from cart
- CLEAR_CART: Empty the cart
- OPEN_CART: Open the cart panel
- START_CHECKOUT: When user is ready to complete purchase
- VIEW_PRODUCT: Show product details

STYLE:
- Be warm, professional, concise (2-3 sentences)
- When recommending, mention: product name, price, producer
- If cart has items and user seems ready, suggest checkout
- Proactively help complete purchases

Examples:
- User says "I want to buy gold": Search for gold products and recommend top options
- User says "add that to cart": Use ADD_TO_CART action
- User says "let's checkout" or "I'm ready to order": Use START_CHECKOUT action`;

const BUYER_ASSISTANT_PROMPT_MULTI = `You are the Exportunity marketplace concierge.

YOUR CAPABILITIES:
1. Help users discover products and services across multiple categories.
2. Recommend items based on needs, location, and budget.
3. Add items to cart and guide through checkout.
4. Ask clarifying questions when specs, quantity, or delivery preferences are missing.

RESPONSE FORMAT - Use JSON with actions:
{
  "message": "Your conversational response",
  "intent": "search" | "order" | "checkout" | "info" | "chat",
  "searchTerms": ["term1"],
  "quantityIntent": "Optional: quantity/intent (e.g., '10 units', 'bulk purchase')",
  "urgency": "Optional: low | medium | high",
  "qualityNotes": "Optional: quality/certification requirements",
  "actions": [
    {"type": "ADD_TO_CART", "productId": 5, "productName": "Exact product name", "quantity": 1},
    {"type": "START_CHECKOUT"},
    {"type": "VIEW_PRODUCT", "productId": 3, "productName": "Exact product name"}
  ]
}

IMPORTANT:
- Return ONLY the JSON object (no markdown, no code fences)
- Do not prefix the response with "json"
- Never claim you added/removed/updated the cart unless you include the matching action`;

const BUYER_CONCIERGE_BLOCKLIST = [
  "cocoa",
  "cacao",
  "shea",
  "karite",
  "textile",
  "tissu",
  "cashew",
  "cajou",
  "noix de cajou",
  "machinery",
  "machine",
  "trommel",
  "crusher",
  "excavator",
  "drill",
  "equipment",
  "opportunit",
  "investment",
];

const BUYER_CONCIERGE_ALLOWLIST = [
  "gold",
  "dore",
  "bullion",
  "bar",
  "bars",
  "ingot",
  "gram",
  "gramme",
  "kg",
  "karat",
  "carat",
  "18k",
  "22k",
  "24k",
  "vault",
  "coffre",
  "delivery",
  "livraison",
  "wallet",
  "portefeuille",
  "panier",
  "cart",
  "checkout",
  "commande",
  "order",
  "prix",
  "price",
  "provenance",
  "certificate",
  "certificat",
  "kyc",
  "aml",
  "compliance",
  "conformite",
];

const BUYER_CONCIERGE_GENERIC_OK = [
  "hi",
  "hello",
  "hey",
  "bonjour",
  "salut",
  "bonsoir",
  "merci",
  "ok",
  "yes",
  "no",
  "help",
  "aide",
  "ajoute",
  "ajouter",
  "remove",
  "retire",
  "retirer",
  "show",
  "montre",
  "voir",
];

function normalizeConciergeText(input: unknown) {
  const raw = typeof input === "string" ? input : "";
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]+/g, "");
}

function detectPreferredLanguage(req: any, message: string): "fr" | "en" | "ar" {
  if (/[\u0600-\u06FF]/.test(message)) return "ar";
  const header = String(req?.headers?.["accept-language"] || "").toLowerCase();
  if (header.startsWith("fr")) return "fr";
  if (header.startsWith("ar")) return "ar";
  return "en";
}

function shouldRefuseBuyerConciergeMessage(message: string) {
  const normalized = normalizeConciergeText(message);
  if (!normalized) return false;

  if (BUYER_CONCIERGE_BLOCKLIST.some((term) => normalized.includes(term))) return true;
  if (BUYER_CONCIERGE_ALLOWLIST.some((term) => normalized.includes(term))) return false;
  if (BUYER_CONCIERGE_GENERIC_OK.some((term) => normalized.includes(term))) return false;

  return true;
}

router.post("/buyer/assistant", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const dataTenant = await resolveMarketplaceDataTenant(tenant);
    const tenantId = dataTenant.id;
    const goldOnly = isGoldTenantKey(dataTenant.key);
    const isDemo = isDemoModeRequest(req);

    const { message, location, geo, conversationHistory = [], cart = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    if (goldOnly && shouldRefuseBuyerConciergeMessage(String(message))) {
      const lang = detectPreferredLanguage(req, String(message));
      const response =
        lang === "fr"
          ? "Je peux uniquement vous aider pour l’or sur Bourse de l’Or (achat en grammes, coffre virtuel, livraison et revente autorisée). Dites-moi quel produit d’or vous cherchez (doré, barres/lingots, bijoux) et votre ville."
          : lang === "ar"
            ? "يمكنني مساعدتك فقط فيما يتعلق بالذهب على Bourse de l’Or (شراء بالجرام، خزنة افتراضية، توصيل، وإعادة بيع بتفويض). أخبرني ما منتج الذهب الذي تبحث عنه (دوريه/سبائك/مجوهرات) وما هي مدينتك."
            : "I can only help with gold on Bourse de l’Or (buy in grams, virtual vault, delivery, and authorized resale). Tell me what gold product you want (doré lot, bars/ingots, jewelry) and your city.";

      return res.json({
        response,
        intent: "chat",
        products: [],
        shops: [],
        orderDetails: null,
        actions: [],
        productData: {},
      });
    }

    if (!openai && !anthropic) {
      return res.json({
        response: "AI assistant is not configured. Set OPENAI_API_KEY (recommended) or ANTHROPIC_API_KEY to enable chat.",
        intent: "chat",
        products: [],
        shops: [],
        orderDetails: null,
        actions: [],
        productData: {},
      });
    }
    
    const userLat = location?.lat || 5.349;
    const userLng = location?.lng || -4.017;
    
    // Get available products
    const availableProducts = await db.select({
      product: sellerProducts,
      seller: sellers,
      category: productCategories
    })
      .from(sellerProducts)
      .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
      .leftJoin(
        productCategories,
        and(eq(sellerProducts.categoryId, productCategories.id), eq(productCategories.tenantId, tenantId)),
      )
      .where(and(
        eq(sellerProducts.status, 'active'),
        eq(sellers.status, 'approved'),
        eq(sellerProducts.tenantId, tenantId),
        eq(sellers.tenantId, tenantId),
        ...(goldOnly ? [goldOnlyWhere()] : [])
      ))
      .limit(15);

    const availableCandidates: BuyerActionCandidate[] = availableProducts
      .map((p) => ({
        id: p.product.id,
        label: `${p.product.name} ${
          isDemo && p.seller?.id ? demoCompanyName(p.seller.id, "seller") : p.seller?.shopName || ""
        }`.trim(),
      }))
      .filter((c) => Number.isFinite(c.id));

    const cartCandidates: BuyerActionCandidate[] = (Array.isArray(cart) ? cart : [])
      .map((item: any) => {
        const id = toIntOrNull(item?.productId);
        if (id == null) return null;
        return { id, label: `${item?.name || ""} ${item?.shopName || ""}`.trim() };
      })
      .filter((c): c is BuyerActionCandidate => !!c);
    
    // Build product context
    let productContext = "\n\nAVAILABLE PRODUCTS (reference by ID for actions):";
    availableProducts.forEach(p => {
      const sellerName =
        isDemo && p.seller?.id ? demoCompanyName(p.seller.id, "seller") : p.seller?.shopName || "Unknown";
      productContext += `\n- ID:${p.product.id} "${p.product.name}" by ${sellerName} - ${parseFloat(p.product.price).toLocaleString()} XOF`;
    });
    
    // Build cart context
    let cartContext = "";
    if (cart.length > 0) {
      const cartTotal = cart.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      cartContext = `\n\nUSER'S CART (${cart.length} items, ${cartTotal.toLocaleString()} XOF total):`;
      cart.forEach((item: any) => {
        cartContext += `\n- ID:${item.productId} "${item.name}" x${item.quantity} (${(item.price * item.quantity).toLocaleString()} XOF) from ${item.shopName || "Unknown"}`;
      });
      cartContext += "\nHint: User has items ready - offer to checkout if appropriate!";
    } else {
      cartContext = "\n\nUSER'S CART: Empty - help them find products to add!";
    }
    
    const systemPrompt = `${goldOnly ? BUYER_ASSISTANT_PROMPT : BUYER_ASSISTANT_PROMPT_MULTI}
${productContext}
${cartContext}

User location: ${userLat.toFixed(2)}, ${userLng.toFixed(2)}`;
    
    const messages = [
      ...conversationHistory.slice(-6),
      { role: "user" as const, content: message }
    ];
    
    const aiText = await createChatCompletionText({
      system: systemPrompt,
      messages,
      maxTokens: 900,
      temperature: 0.5,
      json: true,
      sanitize: goldOnly ? (text) => sanitizeBdoText(text).text : undefined,
    });

    const parsed: any = parseJsonObjectLoose(aiText) || { message: aiText, intent: "chat" };
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return res.json({
        response: "How can I help you find products today?",
        intent: "chat",
        products: [],
        shops: [],
        orderDetails: null,
        actions: [],
        productData: {},
        sourcing: null,
      });
    }

    if (typeof parsed.message !== "string") {
      parsed.message = typeof parsed.message === "number" ? String(parsed.message) : "";
    }

    const sanitizedActions = sanitizeBuyerAssistantActions({
      raw: parsed.actions,
      available: availableCandidates,
      cart: cartCandidates,
    });
    parsed.actions = sanitizedActions;

    const guestSessionId = req.headers["x-guest-session"] as string | undefined;
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const eceUser = token ? await verifySession(token) : null;
    
    const searchTerms = Array.isArray(parsed.searchTerms)
      ? parsed.searchTerms.filter((term: unknown) => typeof term === "string")
      : [];

    if (searchTerms.length > 0) {
      const searchQuery = searchTerms.join(" ").trim();
      const searchResults = await db.select({
        product: sellerProducts,
        seller: sellers,
        category: productCategories,
      })
        .from(sellerProducts)
        .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
        .leftJoin(
          productCategories,
          and(eq(sellerProducts.categoryId, productCategories.id), eq(productCategories.tenantId, tenantId)),
        )
        .where(and(
          eq(sellerProducts.status, 'active'),
          eq(sellers.status, 'approved'),
          eq(sellerProducts.tenantId, tenantId),
          eq(sellers.tenantId, tenantId),
          ...(goldOnly ? [goldOnlyWhere()] : []),
          or(
            ilike(sellerProducts.name, `%${searchQuery}%`),
            ilike(sellerProducts.description, `%${searchQuery}%`)
          )
        ))
        .limit(12);

      const ranked = searchResults
        .map((r) => {
          const distanceKm =
            r.seller?.latitude && r.seller?.longitude
              ? calculateDistance(
                  userLat,
                  userLng,
                  parseFloat(r.seller.latitude.toString()),
                  parseFloat(r.seller.longitude.toString()),
                )
              : null;
          const isVerifiedSeller = !!r.seller?.verifiedAt;
          const totalSold = Number((r.product as any)?.totalSold || 0) || 0;
          return {
            id: r.product.id,
            name: r.product.name,
            price: r.product.price,
            currency: r.product.currency || "XOF",
            shopName: isDemo && r.seller?.id ? demoCompanyName(r.seller.id, "seller") : r.seller?.shopName,
            shopId: r.seller?.id,
            distanceKm,
            isVerifiedSeller,
            totalSold,
          };
        })
        .sort((a, b) => {
          if (a.isVerifiedSeller !== b.isVerifiedSeller) return a.isVerifiedSeller ? -1 : 1;
          const ad = a.distanceKm ?? Number.POSITIVE_INFINITY;
          const bd = b.distanceKm ?? Number.POSITIVE_INFINITY;
          if (ad !== bd) return ad - bd;
          return (b.totalSold || 0) - (a.totalSold || 0);
        })
        .slice(0, 6)
        .map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          currency: p.currency,
          shopName: p.shopName,
          shopId: p.shopId,
          distance: p.distanceKm != null ? `${p.distanceKm.toFixed(1)} km` : null,
          deliveryEta: p.distanceKm != null ? `~${Math.round(20 + p.distanceKm * 3)} min` : null,
          isVerifiedSeller: p.isVerifiedSeller,
        }));

      parsed.suggestedProducts = ranked;

      const shouldSource = ranked.length === 0 || ranked.length < 2;
      if (shouldSource) {
        const now = new Date();
        const dedupeSince = new Date(Date.now() - 15 * 60 * 1000);
        const geoSafe: any = geo && typeof geo === "object" ? geo : {};

        const existing = await db.query.sourcingRequests.findFirst({
          where: and(
            eq(sourcingRequests.status, "open"),
            eq(sourcingRequests.productQuery, searchQuery),
            gte(sourcingRequests.createdAt, dedupeSince),
            eq(sourcingRequests.tenantId, tenantId),
            eceUser?.id ? eq(sourcingRequests.requesterUserId, eceUser.id) : sql`TRUE`,
            guestSessionId ? eq(sourcingRequests.guestSessionId, guestSessionId) : sql`TRUE`,
          ),
          orderBy: [desc(sourcingRequests.createdAt)],
        });

        const request =
          existing ||
          (await db
            .insert(sourcingRequests)
            .values({
              tenantId,
              requesterUserId: eceUser?.id ?? null,
              guestSessionId: guestSessionId ?? null,
              productQuery: searchQuery,
              quantityIntent: typeof parsed?.quantityIntent === "string" ? parsed.quantityIntent.slice(0, 300) : null,
              urgency: typeof parsed?.urgency === "string" ? parsed.urgency.slice(0, 50) : null,
              qualityNotes: typeof parsed?.qualityNotes === "string" ? parsed.qualityNotes.slice(0, 2000) : null,
              marketKey: "marketplace",
              location: {
                lat: userLat,
                lng: userLng,
                ...geoSafe,
              },
              status: "open",
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .then((rows) => rows[0]));

        const label = (geoSafe?.label || geoSafe?.cityName || geoSafe?.countryName) as string | undefined;
        const prefix = ranked.length === 0
          ? `We are sourcing verified sellers${label ? ` in ${label}` : ""} for you.`
          : `We found a few options${label ? ` near ${label}` : ""}, and we're sourcing more verified sellers.`;

        parsed.message = `${prefix} You will be notified when new options are available.`;
        parsed.sourcing = { requestId: request?.id || null, status: "open" };
      }
    }
    
    // Include product data for actions
    const productDataMap: Record<number, any> = {};
    availableProducts.forEach(p => {
      productDataMap[p.product.id] = {
        id: p.product.id,
        name: p.product.name,
        price: parseFloat(p.product.price),
        weight: p.product.weight,
        weightUnit: p.product.weightUnit,
        categorySlug: p.category?.slug,
        categoryName: p.category?.name,
        shopId: p.seller?.id,
        shopName: isDemo && p.seller?.id ? demoCompanyName(p.seller.id, "seller") : p.seller?.shopName
      };
    });

    const actionProductIds = (Array.isArray(sanitizedActions) ? sanitizedActions : [])
      .map((a: any) => (a && typeof a === "object" ? (a as any).productId : null))
      .filter((id: any): id is number => typeof id === "number" && Number.isFinite(id));

    const missingProductIds = [...new Set(actionProductIds)].filter((id) => !productDataMap[id]);
    if (missingProductIds.length > 0) {
      const extraProducts = await db.select({
        product: sellerProducts,
        seller: sellers,
        category: productCategories,
      })
        .from(sellerProducts)
        .leftJoin(sellers, eq(sellerProducts.sellerId, sellers.id))
        .leftJoin(productCategories, eq(sellerProducts.categoryId, productCategories.id))
        .where(and(
          inArray(sellerProducts.id, missingProductIds),
          eq(sellerProducts.status, "active"),
          eq(sellers.status, "approved"),
        ));

      extraProducts.forEach((p) => {
        productDataMap[p.product.id] = {
          id: p.product.id,
          name: p.product.name,
          price: parseFloat(p.product.price),
          weight: p.product.weight,
          weightUnit: p.product.weightUnit,
          categorySlug: p.category?.slug,
          categoryName: p.category?.name,
          shopId: p.seller?.id,
          shopName: isDemo && p.seller?.id ? demoCompanyName(p.seller.id, "seller") : p.seller?.shopName,
        };
      });
    }

    const responseText =
      typeof parsed.message === "string" && parsed.message.trim()
        ? parsed.message
        : searchTerms.length > 0
          ? `Here are a few options for ${searchTerms.join(", ")}.`
          : "How can I help you find products today?";

    res.json({
      response: responseText,
      intent: parsed.intent || 'chat',
      products: parsed.suggestedProducts || [],
      shops: parsed.suggestedShops || [],
      orderDetails: parsed.orderDetails || null,
      actions: sanitizedActions,
      productData: productDataMap,
      sourcing: parsed.sourcing || null,
    });
  } catch (error: any) {
    console.error("[Buyer] Assistant error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/buyer/orders", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const dataTenant = await resolveMarketplaceDataTenant(tenant);
    const marketplaceTenantId = Number(dataTenant.id);

    const {
      items,
      sellerId,
      buyerName,
      buyerPhone,
      buyerEmail,
      deliveryAddress,
      deliveryLat,
      deliveryLng,
      notes,
      pickupPartnerId: pickupPartnerIdRaw,
    } = req.body;
    
    if (!items || !items.length || !sellerId) {
      return res.status(400).json({ error: "Items and sellerId required" });
    }
    
    const toFiniteNumber = (value: any) => {
      const parsed = typeof value === "number" ? value : parseFloat(String(value));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const toWeightGrams = (weightValue: any, unitValue: any) => {
      const weight = toFiniteNumber(weightValue);
      if (!weight) return 0;
      const unit = String(unitValue || "").toLowerCase();
      if (unit === "g" || unit === "gram" || unit === "grams") return weight;
      if (unit === "kg" || unit === "kilogram" || unit === "kilograms") return weight * 1000;
      if (unit === "mg") return weight / 1000;
      if (unit === "oz" || unit === "ounce" || unit === "ounces") return weight * 28.349523125;
      return weight;
    };

    let subtotal = 0;
    const orderItemsData = [];
    const stampedQtyByProductId = new Map<number, number>();
    
    for (const item of items) {
      const [row] = await db
        .select({ product: sellerProducts, category: productCategories })
        .from(sellerProducts)
        .leftJoin(productCategories, eq(sellerProducts.categoryId, productCategories.id))
        .where(and(eq(sellerProducts.id, item.productId), eq(sellerProducts.tenantId, marketplaceTenantId)));

      if (!row?.product) continue;
      const product = row.product;
      const categorySlug = row.category?.slug;
      const quantity = Math.floor(toFiniteNumber(item.quantity));
      if (quantity <= 0) continue;
      
      const price = toFiniteNumber(product.price);

      let unitPrice = price;
      if (categorySlug === "stamped") {
        const weightGrams = toWeightGrams(product.weight, product.weightUnit);
        unitPrice = weightGrams ? price * weightGrams : price;
        stampedQtyByProductId.set(product.id, (stampedQtyByProductId.get(product.id) ?? 0) + quantity);
      }

      const itemTotal = unitPrice * quantity;
      subtotal += itemTotal;
      
      orderItemsData.push({
        productId: product.id,
        productName: product.name,
        productImage: (product.images as any)?.[0] || null,
        quantity,
        unitPrice: unitPrice.toFixed(2),
        subtotal: itemTotal.toFixed(2),
      });
    }
    
    const toUuid = (value: any) => {
      const raw = String(value ?? "").trim();
      if (!raw) return null;
      return /^[0-9a-fA-F-]{36}$/.test(raw) ? raw : null;
    };

    let deliveryFee = 1500;
    let fulfillmentType: string = "delivery";
    let pickupPartnerId: string | null = null;

    if (stampedQtyByProductId.size) {
      pickupPartnerId = toUuid(pickupPartnerIdRaw);
      if (!pickupPartnerId) {
        return res.status(400).json({ error: "pickupPartnerId is required for Stamped Gold orders" });
      }
      const partner = await db.query.partnerJewellers.findFirst({
        where: and(eq(partnerJewellers.id, pickupPartnerId as any), eq(partnerJewellers.tenantId, marketplaceTenantId), eq(partnerJewellers.isActive, true)),
      });
      if (!partner) return res.status(400).json({ error: "Invalid pickup partner" });

      const productIds = Array.from(stampedQtyByProductId.keys());
      const skuRows = await db
        .select()
        .from(stampedGoldSkus)
        .where(and(eq(stampedGoldSkus.tenantId, marketplaceTenantId), inArray(stampedGoldSkus.productId, productIds as any)));
      const skuByProductId = new Map<number, any>(skuRows.map((s) => [Number(s.productId), s]));

      const missingSku = productIds.filter((id) => !skuByProductId.has(id));
      if (missingSku.length) {
        return res.status(400).json({ error: "Stamped Gold SKU missing for one or more products", productIds: missingSku });
      }

      const skuIds = skuRows.map((s) => s.id);
      const stockRows = await db
        .select({
          skuId: stampedGoldItems.skuId,
          inStock: sql<number>`count(*)`,
        })
        .from(stampedGoldItems)
        .where(and(eq(stampedGoldItems.tenantId, marketplaceTenantId), inArray(stampedGoldItems.skuId, skuIds as any), eq(stampedGoldItems.status, "IN_STOCK")))
        .groupBy(stampedGoldItems.skuId);
      const inStockBySkuId = new Map<string, number>(stockRows.map((r) => [String(r.skuId), Number(r.inStock || 0)]));

      const shortages: Array<{ productId: number; required: number; available: number }> = [];
      for (const [productId, required] of stampedQtyByProductId.entries()) {
        const sku = skuByProductId.get(productId);
        const available = inStockBySkuId.get(String(sku.id)) ?? 0;
        if (available < required) shortages.push({ productId, required, available });
      }
      if (shortages.length) {
        return res.status(400).json({ error: "Stamped Gold out of stock", shortages });
      }

      deliveryFee = 0;
      fulfillmentType = "pickup";
    }

    const serviceFee = Math.round(subtotal * 0.05);
    const total = subtotal + deliveryFee + serviceFee;
    
    const orderNumber = `ORD-${Date.now()}-${nanoid(4).toUpperCase()}`;
    
    const [order] = await db.insert(marketplaceOrders).values({
      tenantId: marketplaceTenantId,
      orderNumber,
      sellerId,
      buyerName,
      buyerPhone,
      buyerEmail,
      subtotal: subtotal.toString(),
      deliveryFee: deliveryFee.toString(),
      serviceFee: serviceFee.toString(),
      total: total.toString(),
      fulfillmentType,
      deliveryAddress,
      deliveryLatitude: deliveryLat?.toString(),
      deliveryLongitude: deliveryLng?.toString(),
      pickupPartnerId: pickupPartnerId as any,
      notes,
      status: 'pending',
    }).returning();
    
      for (const itemData of orderItemsData) {
      await db.insert(marketplaceOrderItems).values({
        tenantId: marketplaceTenantId,
        orderId: order.id,
        productId: itemData.productId,
        productName: itemData.productName,
        productImage: itemData.productImage,
        quantity: itemData.quantity,
        unitPrice: itemData.unitPrice,
        subtotal: itemData.subtotal,
      });
    }
    
    res.status(201).json({
      order,
      items: orderItemsData,
      message: `Order ${orderNumber} created successfully`
    });
  } catch (error: any) {
    console.error("[Buyer] Order error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/buyer/orders", async (req, res) => {
  try {
    const email = String(req.query.email ?? "").trim().toLowerCase();
    const phone = String(req.query.phone ?? "").trim();
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));

    const conditions = [];
    if (email) conditions.push(eq(marketplaceOrders.buyerEmail, email));
    if (phone) conditions.push(eq(marketplaceOrders.buyerPhone, phone));

    if (!conditions.length) {
      return res.status(400).json({ error: "Provide 'email' or 'phone' to look up orders" });
    }

    const whereClause = conditions.length === 1 ? conditions[0] : or(...conditions);

    const rows = await db
      .select({
        order: marketplaceOrders,
        seller: {
          id: sellers.id,
          shopName: sellers.shopName,
        },
        itemsCount: sql<number>`count(${marketplaceOrderItems.id})`,
        previewImage: sql<string | null>`max(${marketplaceOrderItems.productImage})`,
      })
      .from(marketplaceOrders)
      .leftJoin(sellers, eq(marketplaceOrders.sellerId, sellers.id))
      .leftJoin(marketplaceOrderItems, eq(marketplaceOrderItems.orderId, marketplaceOrders.id))
      .where(whereClause)
      .groupBy(marketplaceOrders.id, sellers.id)
      .orderBy(desc(marketplaceOrders.createdAt))
      .limit(limit);

    res.json({
      orders: rows.map((r) => ({
        ...r.order,
        itemsCount: Number(r.itemsCount || 0),
        previewImage: r.previewImage,
        seller: r.seller?.id ? r.seller : null,
      })),
    });
  } catch (error: any) {
    console.error("[Buyer] Orders list error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/buyer/orders/:orderNumber", async (req, res) => {
  try {
    const [order] = await db.select().from(marketplaceOrders)
      .where(eq(marketplaceOrders.orderNumber, req.params.orderNumber));
    
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const items = await db.select().from(marketplaceOrderItems)
      .where(eq(marketplaceOrderItems.orderId, order.id));
    
    const [seller] = await db.select().from(sellers)
      .where(eq(sellers.id, order.sellerId));
    
    res.json({
      order,
      items,
      seller: seller ? {
        id: seller.id,
        shopName: seller.shopName,
        phone: seller.phoneNumber,
        latitude: seller.latitude,
        longitude: seller.longitude,
      } : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/buyer/orders/:orderNumber/pay-with-wallet", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const dataTenant = await resolveMarketplaceDataTenant(tenant);

    const orderNumber = String(req.params.orderNumber || "").trim();
    if (!orderNumber) return res.status(400).json({ message: "orderNumber is required" });

    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifySession(token);

    let walletUserId: string | null = null;
    let expectedBuyerEmail: string | null = null;

    if (user?.id) {
      walletUserId = String(user.id);
      expectedBuyerEmail = user.email ? String(user.email) : null;
    } else {
      const guestSessionId = String(req.headers["x-guest-session"] || "").trim();
      if (guestSessionId) {
        const guestId = `guest:${guestSessionId}`.toLowerCase();
        walletUserId = guestId;
        expectedBuyerEmail = guestId;
      }
    }

    if (!walletUserId || !expectedBuyerEmail) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const wallet = await getOrCreateWalletAccount(walletUserId, "XOF");

    const out = await payMarketplaceOrderWithWallet({
      tenantId: dataTenant.id,
      orderNumber,
      walletAccountId: wallet.id,
      expectedBuyerEmail,
    });

    res.json({ ok: true, ...out });
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg === "order_not_found") return res.status(404).json({ message: "Order not found" });
    if (msg === "order_not_owned") return res.status(403).json({ message: "Order does not belong to this user" });
    if (msg === "wallet_not_found") return res.status(404).json({ message: "Wallet not found" });
    if (msg === "wallet_not_active") return res.status(403).json({ message: "Wallet is not active" });
    if (msg.includes("insufficient_balance")) return res.status(400).json({ message: "Insufficient wallet balance" });

    console.error("[Buyer] Wallet order payment error:", error);
    res.status(500).json({ message: "Failed to pay with wallet" });
  }
});

// Admin: list all orders across all sellers
router.get("/admin/orders", async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
    const status = String(req.query.status ?? "").trim();

    const whereClause = status ? eq(marketplaceOrders.status, status as any) : undefined;

    const rows = await db
      .select({
        order: marketplaceOrders,
        seller: {
          id: sellers.id,
          shopName: sellers.shopName,
        },
        itemsCount: sql<number>`count(${marketplaceOrderItems.id})`,
        previewImage: sql<string | null>`max(${marketplaceOrderItems.productImage})`,
      })
      .from(marketplaceOrders)
      .leftJoin(sellers, eq(marketplaceOrders.sellerId, sellers.id))
      .leftJoin(marketplaceOrderItems, eq(marketplaceOrderItems.orderId, marketplaceOrders.id))
      .where(whereClause as any)
      .groupBy(marketplaceOrders.id, sellers.id)
      .orderBy(desc(marketplaceOrders.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      orders: rows.map((r) => ({
        ...r.order,
        itemsCount: Number(r.itemsCount || 0),
        previewImage: r.previewImage,
        seller: r.seller?.id ? r.seller : null,
      })),
    });
  } catch (error: any) {
    console.error("[Admin] Orders list error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Seller/Admin: update an order status (used by seller dashboard)
router.patch("/orders/:orderId", async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (!Number.isFinite(orderId)) {
      return res.status(400).json({ error: "Invalid orderId" });
    }

    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const tenantId = tenant.id;

    const auth = await requireEceAuth(req, res);
    if (!auth) return;

    const viewer = auth.user as any;
    const isAdminViewer = isEceAdmin(viewer);

    const [existing] = await db
      .select()
      .from(marketplaceOrders)
      .where(and(eq(marketplaceOrders.id, orderId), eq(marketplaceOrders.tenantId, tenantId)));

    if (!existing) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (!isAdminViewer) {
      const orderSeller = await db.query.sellers.findFirst({
        where: and(eq(sellers.id, Number(existing.sellerId)), eq(sellers.tenantId, tenantId)),
      });

      if (!orderSeller || Number(orderSeller.userId) !== Number(viewer.id)) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const status = String(req.body?.status ?? "").trim();
    const cancellationReason = req.body?.cancellationReason ?? req.body?.reason ?? null;

    const allowed = new Set(["pending", "confirmed", "processing", "ready", "delivered", "cancelled"]);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${Array.from(allowed).join(", ")}` });
    }

    const updates: any = { status, updatedAt: new Date() };
    if (status === "confirmed") updates.confirmedAt = new Date();
    if (status === "ready") updates.readyAt = new Date();
    if (status === "delivered") updates.deliveredAt = new Date();
    if (status === "cancelled") {
      updates.cancelledAt = new Date();
      updates.cancellationReason = cancellationReason ? String(cancellationReason) : "Cancelled";
    }

    const [updated] = await db
      .update(marketplaceOrders)
      .set(updates)
      .where(and(eq(marketplaceOrders.id, orderId), eq(marketplaceOrders.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(updated);
  } catch (error: any) {
    console.error("[Order] Update error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/seed-gold-mines", async (req, res) => {
  try {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const goldMines = [
      { name: "DIABY Lassina", region: "Boundiali", country: "Côte d'Ivoire", lat: "9.5200", lng: "-6.4800" },
      { name: "KONE Siaka", region: "Korhogo", country: "Côte d'Ivoire", lat: "9.4580", lng: "-5.6294" },
      { name: "OUATTARA Moussa", region: "Ferkessédougou", country: "Côte d'Ivoire", lat: "9.5933", lng: "-5.1944" },
      { name: "COULIBALY Amadou", region: "Odienné", country: "Côte d'Ivoire", lat: "9.5000", lng: "-7.5667" },
      { name: "TRAORE Ibrahim", region: "Tengréla", country: "Côte d'Ivoire", lat: "10.4833", lng: "-6.4000" },
      { name: "SANGARE Bakary", region: "Séguéla", country: "Côte d'Ivoire", lat: "7.9614", lng: "-6.6731" },
      { name: "KONATE Drissa", region: "Touba", country: "Côte d'Ivoire", lat: "8.2833", lng: "-7.6833" },
      { name: "BAMBA Seydou", region: "Mankono", country: "Côte d'Ivoire", lat: "8.0583", lng: "-6.1900" },
      { name: "FOFANA Lacina", region: "Dabakala", country: "Côte d'Ivoire", lat: "8.3667", lng: "-4.4333" },
      { name: "SYLLA Mamadou", region: "Katiola", country: "Côte d'Ivoire", lat: "8.1381", lng: "-5.1019" },
      { name: "Ghana Gold Corp", region: "Ashanti", country: "Ghana", lat: "6.6885", lng: "-1.6244" },
      { name: "Obuasi Mining Ltd", region: "Obuasi", country: "Ghana", lat: "6.2050", lng: "-1.6590" },
      { name: "Tarkwa Gold Fields", region: "Western", country: "Ghana", lat: "5.3053", lng: "-1.9950" },
      { name: "Prestea Resources", region: "Prestea", country: "Ghana", lat: "5.4333", lng: "-2.1500" },
      { name: "Mali Gold Sarl", region: "Kayes", country: "Mali", lat: "14.4469", lng: "-11.4356" },
      { name: "Syama Mining Co", region: "Sikasso", country: "Mali", lat: "11.3188", lng: "-5.6897" },
      { name: "Loulo Gold Operations", region: "Kayes", country: "Mali", lat: "14.1833", lng: "-11.6333" },
      { name: "Burkina Gold SARL", region: "Centre-Nord", country: "Burkina Faso", lat: "13.5833", lng: "-0.9667" },
      { name: "Essakane Mining", region: "Sahel", country: "Burkina Faso", lat: "14.3833", lng: "-0.5333" },
      { name: "Senegal Minerals", region: "Kédougou", country: "Senegal", lat: "12.5500", lng: "-12.1833" },
      { name: "Sabodala Gold", region: "Tambacounda", country: "Senegal", lat: "13.0333", lng: "-12.0500" },
      { name: "Guinea Gold Corp", region: "Siguiri", country: "Guinea", lat: "11.4167", lng: "-9.1667" },
      { name: "Lefa Mining", region: "Lélouma", country: "Guinea", lat: "11.0333", lng: "-10.4833" },
      { name: "Niger Gold Ltd", region: "Tillabéri", country: "Niger", lat: "14.2128", lng: "1.4536" },
    ];

    const createdSellers = [];
    
    let goldCategory = await db.query.productCategories.findFirst({
      where: and(eq(productCategories.tenantId, tenant.id), eq(productCategories.slug, 'dore'))
    });
    
    if (!goldCategory) {
      const [newCategory] = await db.insert(productCategories).values({
        tenantId: tenant.id,
        name: 'Dore',
        slug: 'dore',
        description: 'Raw gold dore lots from licensed suppliers',
        icon: '🥇'
      }).returning();
      goldCategory = newCategory;
    }

    let systemUser = await db.query.users.findFirst({
      where: eq(users.email, "system@exportunity.com")
    });

    if (!systemUser) {
      const [newUser] = await db.insert(users).values({
        email: "system@exportunity.com",
        displayName: "Exportunity System",
        role: "admin",
        accountType: "System",
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      systemUser = newUser;
    }

    for (const mine of goldMines) {
      const existingSeller = await db.query.sellers.findFirst({
        where: and(eq(sellers.tenantId, tenant.id), eq(sellers.shopName, mine.name))
      });

      if (existingSeller) {
        continue;
      }

      const slug = mine.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + nanoid(4);
      
      const [seller] = await db.insert(sellers).values({
        tenantId: tenant.id,
        userId: systemUser.id,
        shopName: mine.name,
        slug,
        description: `Licensed gold mining operation in ${mine.region}, ${mine.country}. Authorized semi-industrial gold extraction with full government compliance.`,
        latitude: mine.lat,
        longitude: mine.lng,
        streetAddress: `${mine.region}, ${mine.country}`,
        phoneNumber: `+225 ${Math.floor(Math.random() * 9000000000) + 1000000000}`.slice(0, 15),
        isProducer: true,
        productionType: 'gold_mining',
        status: 'approved',
        verifiedAt: new Date(),
        approvedAt: new Date(),
        isDemo: true,
      }).returning();

      const products = [
        { name: 'Gold Dore Lot - Standard Grade', price: '68000', desc: 'Unrefined gold dore lot from licensed site. Typical purity 85-92%. Chain-of-custody documentation included.', unit: 'gram' },
        { name: 'Gold Dore Lot - High Grade', price: '75000', desc: 'Higher-purity dore lot (92-96%). Sourced from licensed operations with traceability documentation.', unit: 'gram' },
        { name: 'Gold Nuggets Parcel', price: '78000', desc: 'Natural gold nuggets (unrefined). Assay and origin documents available for export workflows.', unit: 'gram' },
        { name: 'Gold Dust Batch', price: '70000', desc: 'Fine gold dust batch (unrefined). Intended for refining and B2B trading with verification.', unit: 'gram' },
      ];

      for (const prod of products) {
        const productSlug = prod.name.toLowerCase().replace(/\s+/g, '-') + '-' + nanoid(4);
        const lowerName = prod.name.toLowerCase();
        const images = lowerName.includes("dust")
          ? ["/product-images/dore-dust-01.png", "/product-images/dore-lot-01.png", "/product-images/dore-nuggets-01.png"]
          : lowerName.includes("nugget")
            ? ["/product-images/dore-nuggets-01.png", "/product-images/dore-nuggets-02.png", "/product-images/dore-lot-01.png"]
            : lowerName.includes("dore")
              ? ["/product-images/dore-lot-01.png", "/product-images/dore-nuggets-01.png", "/product-images/dore-nuggets-02.png"]
              : ["/product-images/dore-lot-01.png", "/product-images/dore-nuggets-01.png", "/product-images/dore-dust-01.png"];
        await db.insert(sellerProducts).values({
          tenantId: tenant.id,
          sellerId: seller.id,
          categoryId: goldCategory.id,
          name: prod.name,
          slug: productSlug,
          description: prod.desc,
          shortDescription: prod.desc,
          price: prod.price,
          currency: 'XOF',
          stockQuantity: Math.floor(Math.random() * 100) + 10,
          status: 'active',
          isHandmade: false,
          images,
        });
      }

      createdSellers.push({
        id: seller.id,
        name: seller.shopName,
        region: mine.region,
        country: mine.country,
        lat: mine.lat,
        lng: mine.lng
      });
    }

    res.json({
      success: true,
      message: `Created ${createdSellers.length} gold mine sellers`,
      sellers: createdSellers
    });
  } catch (error: any) {
    console.error("[Marketplace] Seed gold mines error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/gold-mines", async (req, res) => {
  try {
    const goldSellers = await db.select().from(sellers)
      .where(eq(sellers.productionType, 'gold_mining'));
    
    const goldMines = goldSellers.map(s => ({
      id: s.id,
      name: s.shopName,
      description: s.description,
      latitude: s.latitude,
      longitude: s.longitude,
      address: s.streetAddress,
      phone: s.phoneNumber,
      status: s.status,
      verified: !!s.verifiedAt,
      category: 'gold',
    }));

    res.json(goldMines);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const goldPriceCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60000;

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

router.get("/fx-rates", async (req, res) => {
  try {
    const scope = tenantFxScopeFromRequest(req);
    const data = await getFxSnapshot(scope);
    res.json({
      base: data.base,
      baseRates: data.baseRates,
      effectiveRates: data.effectiveRates,
      overrides: data.overrides,
      rates: data.effectiveRates,
      updatedAt: data.updatedAt,
      providerTimestamp: data.providerTimestamp,
      isStale: data.isStale,
      source: data.source,
      overrideApplied: data.overrideApplied,
    });
  } catch (error: any) {
    console.error("[FX Rates] Error:", error);
    res.status(500).json({ error: "Failed to fetch FX rates" });
  }
});

router.get("/gold-price", async (req, res) => {
  try {
    const scope = tenantFxScopeFromRequest(req);
    const cached = goldPriceCache.get(scope);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    const fx = await getFxSnapshot(scope);
    const USD_TO_XOF = getUsdConversionRateForCurrency(fx.effectiveRates, "XOF");
    const TROY_OZ_TO_GRAM = 31.1034768;

    const spot = await fetchJsonWithTimeout("https://data-asg.goldprice.org/dbXRates/USD", 6000);
    const item = spot?.items?.[0];
    const spotUSDPerOz = Number(item?.xauPrice);
    if (!Number.isFinite(spotUSDPerOz) || spotUSDPerOz <= 0) {
      throw new Error("Invalid spot gold price");
    }

    const percentChange = Number(item?.pcXau);
    const isUp = Number.isFinite(percentChange) ? percentChange >= 0 : true;

    const purePerGramUSD = spotUSDPerOz / TROY_OZ_TO_GRAM;
    const purePerGramXOF = purePerGramUSD * USD_TO_XOF;

    const refined22KPriceXOF = purePerGramXOF * 0.9167;
    const refined18KPriceXOF = purePerGramXOF * 0.75;

    const localPremiumPercentEnv = Number(process.env.LOCAL_PREMIUM_PERCENT || "0");
    const localPremium = Number.isFinite(localPremiumPercentEnv) ? localPremiumPercentEnv / 100 : 0;
    const local22KPriceXOF = refined22KPriceXOF * (1 + localPremium);
    const local18KPriceXOF = refined18KPriceXOF * (1 + localPremium);

    const priceData = {
      timestamp: new Date().toISOString(),
      lbma: {
        priceUSD: spotUSDPerOz.toFixed(3),
        change24h: Number.isFinite(percentChange) ? percentChange.toFixed(2) : "0.00",
        isUp,
      },
      international: {
        dore: { priceXOF: "0", label: "Doré (quote)", purityRange: "assay-based" },
        refined22K: { priceXOF: refined22KPriceXOF.toFixed(0), label: "Refined 22K", purity: "91.67%" },
        refined18K: { priceXOF: refined18KPriceXOF.toFixed(0), label: "Refined 18K", purity: "75.00%" },
      },
      local: {
        market: "Côte d'Ivoire",
        dore: { priceXOF: "0", label: "Local Doré (quote)" },
        refined22K: { priceXOF: local22KPriceXOF.toFixed(0), label: "Local 22K" },
        refined18K: { priceXOF: local18KPriceXOF.toFixed(0), label: "Local 18K" },
        premiumPercent: (localPremium * 100).toFixed(1),
      },
      fxRates: fx?.effectiveRates,
      fxMeta: {
        updatedAt: fx.updatedAt,
        providerTimestamp: fx.providerTimestamp,
        isStale: fx.isStale,
        source: fx.source,
        overrideApplied: fx.overrideApplied,
      },
    };

    goldPriceCache.set(scope, { data: priceData, timestamp: Date.now() });
    res.json(priceData);
  } catch (error: any) {
    console.error("[Gold Price] Error fetching price:", error);
    res.status(500).json({ error: "Failed to fetch gold prices" });
  }
});

export default router;
