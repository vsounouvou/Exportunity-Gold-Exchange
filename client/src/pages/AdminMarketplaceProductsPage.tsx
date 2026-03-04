import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { absolutizePublicUrl } from "@/lib/assets";
import { broadcastMarketplaceRefresh } from "@/lib/marketplaceRefresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Trash2, Upload, Wand2 } from "lucide-react";

type AdminProductCategory = { id: number; name: string; slug: string };
type AdminSeller = { id: number; shopName: string };

type ImageAssetRef = { namespace: string; assetKey: string };

type AdminProductItem = {
  product: any;
  seller: any;
  category: any;
  imageAsset: ImageAssetRef;
};

type GeneratedImage = {
  id: string;
  storedUrl?: string | null;
  status?: string | null;
  error?: string | null;
  createdAt?: string | null;
  prompt?: string | null;
  negativePrompt?: string | null;
  model?: string | null;
};

type ProductImageSlot = {
  id: string;
  role: string;
  position: number;
  label: string | null;
  assetNamespace: string;
  assetKey: string;
  metadata?: any;
  active: {
    url: string | null;
    updatedAt: number | null;
    activeImageId: string | null;
  };
};

type ProductImagesPayload = {
  ok: boolean;
  tenantKey: string;
  productId: number;
  categorySlug: string;
  basePrompt: string;
  negativePrompt: string;
  aspect: string;
  modelTier: string;
  primaryAssetKey: string;
  slots: ProductImageSlot[];
};

type EditProductForm = {
  name: string;
  slug: string;
  status: string;
  categoryId: string;
  sellerId: string;

  price: string;
  currency: string;
  compareAtPrice: string;
  costPrice: string;

  sku: string;
  barcode: string;

  stockQuantity: string;
  lowStockThreshold: string;
  trackInventory: boolean;
  allowBackorder: boolean;

  weight: string;
  weightUnit: string;
  dimensionsJson: string;

  shortDescription: string;
  description: string;
  tagsCsv: string;

  isHandmade: boolean;
  productionTime: string;

  videoUrl: string;
  videosCsv: string;

  ingredientsJson: string;
  allergensJson: string;
  certificationsJson: string;
  attributesJson: string;
};

type SlotPromptOverrides = {
  label: string;
  angle: string;
  promptOverride: string;
  negativePromptOverride: string;
};

type ProductI18nLang = "en" | "fr" | "ar";
type ProductI18nFields = { name?: string; shortDescription?: string; description?: string };
type ProductI18n = Partial<Record<ProductI18nLang, ProductI18nFields>>;

function normalizeProductI18n(value: unknown): ProductI18n {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ProductI18n = {};

  for (const lang of ["en", "fr", "ar"] as const) {
    const entry = (value as any)[lang];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    result[lang] = {
      name: typeof entry.name === "string" ? entry.name : undefined,
      shortDescription: typeof entry.shortDescription === "string" ? entry.shortDescription : undefined,
      description: typeof entry.description === "string" ? entry.description : undefined,
    };
  }

  return result;
}

function cleanProductI18n(i18n: ProductI18n): ProductI18n {
  const result: ProductI18n = {};
  for (const lang of ["en", "fr", "ar"] as const) {
    const entry = i18n[lang];
    if (!entry) continue;
    const cleaned: ProductI18nFields = {};
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const shortDescription = typeof entry.shortDescription === "string" ? entry.shortDescription.trim() : "";
    const description = typeof entry.description === "string" ? entry.description.trim() : "";

    if (name) cleaned.name = name;
    if (shortDescription) cleaned.shortDescription = shortDescription;
    if (description) cleaned.description = description;

    if (Object.keys(cleaned).length) result[lang] = cleaned;
  }
  return result;
}

type ImagePromptEditorState = {
  productId: number;
  slotId: string;
  assetKey: string;
  slotLabel: string;
  imageId: string;
  model: string;
  prompt: string;
  negativePrompt: string;
};

const PLACEHOLDER_PALETTE = [
  { bg: "#0f172a", accent: "#f59e0b" },
  { bg: "#111827", accent: "#10b981" },
  { bg: "#0b1320", accent: "#eab308" },
  { bg: "#111114", accent: "#f97316" },
  { bg: "#0b0f14", accent: "#22d3ee" },
] as const;

function pickFirstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const first = images.find((x) => typeof x === "string" && x.trim());
  return typeof first === "string" ? first : null;
}

function buildProductPlaceholder(product: any, subtitle: string, variantIndex: number, titleOverride?: string | null) {
  const seed = Number(product?.id || 0) + variantIndex * 19;
  const palette = PLACEHOLDER_PALETTE[Math.abs(seed) % PLACEHOLDER_PALETTE.length];
  const title = String(titleOverride || product?.name || subtitle || "Product").replace(/\s+/g, " ").trim().slice(0, 24);
  const sub = String(subtitle || "").replace(/\s+/g, " ").trim().slice(0, 28);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.bg}"/>
          <stop offset="100%" stop-color="#000000"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1080" fill="url(#g)"/>
      <circle cx="860" cy="220" r="170" fill="${palette.accent}" opacity="0.18"/>
      <circle cx="250" cy="930" r="220" fill="${palette.accent}" opacity="0.14"/>
      <rect x="110" y="150" width="860" height="780" rx="64" fill="none" stroke="${palette.accent}" stroke-width="4" opacity="0.35"/>
      <text x="150" y="290" fill="${palette.accent}" font-family="Arial, sans-serif" font-size="34" letter-spacing="4">${sub}</text>
      <text x="150" y="375" fill="#ffffff" font-family="Arial, sans-serif" font-size="52" font-weight="650">${title}</text>
      <text x="150" y="430" fill="#ffffff" opacity="0.62" font-family="Arial, sans-serif" font-size="26">Placeholder (no image yet)</text>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function toJsonText(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return trimmed;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function parseJsonField(input: string, label: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${label}: invalid JSON`);
  }
}

function parseIntField(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

function stringifyTags(value: unknown) {
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string" && x.trim()).join(", ");
  if (typeof value === "string") return value;
  return toJsonText(value);
}

function parseTagsCsv(input: string) {
  const tags = input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length ? Array.from(new Set(tags)) : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 200);
}

function parseQueryId(location: string, key: string): number | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseQueryString(location: string, key: string): string | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

function buildQuery(location: string, params: Record<string, string | null>) {
  const path = location.split("?")[0] || "/admin/marketplace/products";
  const next = new URLSearchParams(location.split("?")[1] || "");
  for (const [k, v] of Object.entries(params)) {
    if (!v) next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}

export default function AdminMarketplaceProductsPage() {
  const { token } = useSession();
  const [location, setLocation] = useLocation();
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : undefined),
    [token],
  );
  const slotFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [items, setItems] = useState<AdminProductItem[]>([]);
  const [fetchedById, setFetchedById] = useState<Record<string, AdminProductItem>>({});
  const [categories, setCategories] = useState<AdminProductCategory[]>([]);
  const [sellers, setSellers] = useState<AdminSeller[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenantKey, setTenantKey] = useState<string>(() => parseQueryString(location, "tenantKey") || "");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [sellerId, setSellerId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [hasImage, setHasImage] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [limit, setLimit] = useState<number>(100);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [busyProductId, setBusyProductId] = useState<number | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);

  const editId = parseQueryId(location, "edit");
  const historyId = parseQueryId(location, "history");
  const imagesId = parseQueryId(location, "images");

  const [editOpen, setEditOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<any | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<AdminProductItem | null>(null);
  const [historyItems, setHistoryItems] = useState<GeneratedImage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [imagesOpen, setImagesOpen] = useState(false);
  const [imagesProduct, setImagesProduct] = useState<AdminProductItem | null>(null);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesPayload, setImagesPayload] = useState<ProductImagesPayload | null>(null);
  const [imagesBasePrompt, setImagesBasePrompt] = useState("");
  const [imagesNegativePrompt, setImagesNegativePrompt] = useState("");
  const [imagesAutoSetActive, setImagesAutoSetActive] = useState(true);
  const [imagesPreset, setImagesPreset] = useState<string>("auto");
  const [imagesCount, setImagesCount] = useState<number>(8);
  const [slotHistories, setSlotHistories] = useState<Record<string, GeneratedImage[]>>({});
  const [slotHistoryLoading, setSlotHistoryLoading] = useState<Record<string, boolean>>({});
  const [slotOverridesById, setSlotOverridesById] = useState<Record<string, SlotPromptOverrides>>({});
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorBusy, setPromptEditorBusy] = useState(false);
  const [promptEditor, setPromptEditor] = useState<ImagePromptEditorState | null>(null);

  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillResult, setBackfillResult] = useState<any | null>(null);

  const withTenantKey = useCallback(
    (path: string) => {
      if (!tenantKey) return path;
      const joiner = path.includes("?") ? "&" : "?";
      return `${path}${joiner}tenantKey=${encodeURIComponent(tenantKey)}`;
    },
    [tenantKey],
  );

  const quickGoldCategories = useMemo(() => {
    const bySlug = new Map<string, AdminProductCategory>();
    for (const c of categories) bySlug.set(String(c.slug || "").trim(), c);
    return (["stamped", "jewelry", "gold-art", "dore"] as const)
      .map((slug) => bySlug.get(slug))
      .filter(Boolean) as AdminProductCategory[];
  }, [categories]);

  useEffect(() => {
    const fromUrl = parseQueryString(location, "tenantKey") || "";
    if (fromUrl !== tenantKey) setTenantKey(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const [editForm, setEditForm] = useState<EditProductForm>({
    name: "",
    slug: "",
    status: "draft",
    categoryId: "",
    sellerId: "",
    price: "",
    currency: "XOF",
    compareAtPrice: "",
    costPrice: "",
    sku: "",
    barcode: "",
    stockQuantity: "0",
    lowStockThreshold: "5",
    trackInventory: true,
    allowBackorder: false,
    weight: "",
    weightUnit: "kg",
    dimensionsJson: "",
    shortDescription: "",
    description: "",
    tagsCsv: "",
    isHandmade: true,
    productionTime: "",
    videoUrl: "",
    videosCsv: "",
    ingredientsJson: "",
    allergensJson: "",
    certificationsJson: "",
    attributesJson: "",
  });
  const [editI18nLang, setEditI18nLang] = useState<ProductI18nLang>("fr");
  const [editI18n, setEditI18n] = useState<ProductI18n>({});
  const [suggestBusyField, setSuggestBusyField] = useState<string | null>(null);

  const loadReferenceData = async () => {
    if (!headers) return;
    const qs = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";
    const [cats, sels] = await Promise.all([
      apiRequest(`/api/admin/marketplace/categories${qs}`, { headers }),
      apiRequest(`/api/admin/marketplace/sellers${qs}`, { headers }),
    ]);
    setCategories(cats?.categories || []);
    setSellers(sels?.sellers || []);
  };

  const loadProducts = async (opts?: { offset?: number; append?: boolean }) => {
    if (!headers) return;
    const nextOffset = Math.max(0, Math.trunc(opts?.offset ?? 0));
    const append = Boolean(opts?.append);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tenantKey) params.set("tenantKey", tenantKey);
      if (q.trim()) params.set("q", q.trim());
      if (categoryId) params.set("categoryId", categoryId);
      if (sellerId) params.set("sellerId", sellerId);
      if (status) params.set("status", status);
      if (hasImage) params.set("hasImage", hasImage);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", String(limit));
      params.set("offset", String(nextOffset));

      const url = `/api/admin/marketplace/products${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await apiRequest(url, { headers });
      const nextItems = Array.isArray(res?.items) ? res.items : [];
      setOffset(nextOffset);
      setHasMore(nextItems.length >= limit);
      setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
    } catch (err: any) {
      setError(err?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadReferenceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tenantKey]);

  useEffect(() => {
    if (!token) return;
    setItems([]);
    setFetchedById({});
    setOffset(0);
    setHasMore(false);
    loadProducts({ offset: 0, append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tenantKey]);

  const fetchProductItem = useCallback(
    async (productId: number) => {
      if (!headers) return null;
      const key = String(productId);
      const cached = fetchedById[key];
      if (cached) return cached;
      try {
        const res = await apiRequest(withTenantKey(`/api/admin/marketplace/products/${productId}`), { headers });
        const item = (res?.item ?? null) as AdminProductItem | null;
        if (!item?.product) return null;
        setFetchedById((prev) => ({ ...prev, [key]: item }));
        return item;
      } catch (err: any) {
        setError(err?.message || "Failed to load product");
        return null;
      }
    },
    [headers, withTenantKey, fetchedById],
  );

  const openEditFromItem = useCallback((item: AdminProductItem) => {
    const p = item?.product || {};
    const attrs = p?.attributes && typeof p.attributes === "object" && !Array.isArray(p.attributes) ? (p.attributes as any) : {};
    const videoUrl = typeof attrs?.videoUrl === "string" ? String(attrs.videoUrl) : "";
    const videos = Array.isArray(attrs?.videos) ? attrs.videos.filter((x: any) => typeof x === "string").map(String) : [];

    setEditProduct(p);
    setEditI18n(normalizeProductI18n(attrs?.i18n));
    setEditI18nLang("fr");
    setEditForm({
      name: String(p?.name || ""),
      slug: String(p?.slug || ""),
      status: String(p?.status || "draft"),
      categoryId: p?.categoryId != null ? String(p.categoryId) : "",
      sellerId: p?.sellerId != null ? String(p.sellerId) : "",
      price: String(p?.price ?? ""),
      currency: String(p?.currency || "XOF"),
      compareAtPrice: String(p?.compareAtPrice ?? ""),
      costPrice: String(p?.costPrice ?? ""),
      sku: String(p?.sku ?? ""),
      barcode: String(p?.barcode ?? ""),
      stockQuantity: p?.stockQuantity != null ? String(p.stockQuantity) : "",
      lowStockThreshold: p?.lowStockThreshold != null ? String(p.lowStockThreshold) : "",
      trackInventory: p?.trackInventory ?? true,
      allowBackorder: p?.allowBackorder ?? false,
      weight: String(p?.weight ?? ""),
      weightUnit: String(p?.weightUnit || "kg"),
      dimensionsJson: toJsonText(p?.dimensions),
      shortDescription: String(p?.shortDescription ?? ""),
      description: String(p?.description ?? ""),
      tagsCsv: stringifyTags(p?.tags),
      isHandmade: p?.isHandmade ?? true,
      productionTime: String(p?.productionTime ?? ""),
      videoUrl,
      videosCsv: videos.join("\n"),
      ingredientsJson: toJsonText(p?.ingredients),
      allergensJson: toJsonText(p?.allergens),
      certificationsJson: toJsonText(p?.certifications),
      attributesJson: toJsonText(p?.attributes),
    });
    setEditOpen(true);
  }, [setEditOpen, setEditForm, setEditProduct]);

  const openHistoryFromItem = useCallback((item: AdminProductItem) => {
    setHistoryProduct(item);
    setHistoryOpen(true);
  }, [setHistoryOpen, setHistoryProduct]);

  const openImagesFromItem = useCallback((item: AdminProductItem) => {
    setImagesProduct(item);
    setImagesOpen(true);
  }, [setImagesOpen, setImagesProduct]);

  useEffect(() => {
    if (!editId) return;
    const found = items.find((it) => Number(it.product?.id) === editId) || fetchedById[String(editId)] || null;
    if (found) {
      openEditFromItem(found);
      return;
    }

    let cancelled = false;
    void (async () => {
      const item = await fetchProductItem(editId);
      if (cancelled || !item) return;
      openEditFromItem(item);
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, items, fetchedById, fetchProductItem, openEditFromItem]);

  useEffect(() => {
    if (!historyId) return;
    const found = items.find((it) => Number(it.product?.id) === historyId) || fetchedById[String(historyId)] || null;
    if (found) {
      openHistoryFromItem(found);
      return;
    }

    let cancelled = false;
    void (async () => {
      const item = await fetchProductItem(historyId);
      if (cancelled || !item) return;
      openHistoryFromItem(item);
    })();

    return () => {
      cancelled = true;
    };
  }, [historyId, items, fetchedById, fetchProductItem, openHistoryFromItem]);

  useEffect(() => {
    if (!imagesId) return;
    const found = items.find((it) => Number(it.product?.id) === imagesId) || fetchedById[String(imagesId)] || null;
    if (found) {
      openImagesFromItem(found);
      return;
    }

    let cancelled = false;
    void (async () => {
      const item = await fetchProductItem(imagesId);
      if (cancelled || !item) return;
      openImagesFromItem(item);
    })();

    return () => {
      cancelled = true;
    };
  }, [imagesId, items, fetchedById, fetchProductItem, openImagesFromItem]);

  const closeEdit = () => {
    setEditOpen(false);
    setEditProduct(null);
    setEditI18n({});
    setEditI18nLang("fr");
    setLocation(buildQuery(location, { edit: null }));
  };

  const closeHistory = () => {
    setHistoryOpen(false);
    setHistoryProduct(null);
    setHistoryItems([]);
    setLocation(buildQuery(location, { history: null }));
  };

  const resetImagesState = () => {
    setImagesOpen(false);
    setImagesProduct(null);
    setImagesPayload(null);
    setImagesBasePrompt("");
    setImagesNegativePrompt("");
    setSlotHistories({});
    setSlotHistoryLoading({});
    setSlotOverridesById({});
    setPromptEditorOpen(false);
    setPromptEditorBusy(false);
    setPromptEditor(null);
  };

  const closeImages = () => {
    resetImagesState();
    setLocation(buildQuery(location, { images: null }));
  };

  const openEdit = (productId: number) => setLocation(buildQuery(location, { edit: String(productId), tenantKey: tenantKey || null }));
  const openHistory = (productId: number) =>
    setLocation(buildQuery(location, { history: String(productId), tenantKey: tenantKey || null }));
  const openImages = (productId: number) => setLocation(buildQuery(location, { images: String(productId), tenantKey: tenantKey || null }));

  const switchEditToImages = (productId: number) => {
    setEditOpen(false);
    setEditProduct(null);
    setLocation(buildQuery(location, { edit: null, images: String(productId), tenantKey: tenantKey || null }));
  };

  const switchImagesToEdit = (productId: number) => {
    resetImagesState();
    setLocation(buildQuery(location, { images: null, edit: String(productId), tenantKey: tenantKey || null }));
  };

  const loadHistory = async (item: AdminProductItem) => {
    if (!headers) return;
    setHistoryLoading(true);
    setError(null);
    try {
      const res = await apiRequest(
        `/api/admin/assets/images/history?namespace=${encodeURIComponent(item.imageAsset.namespace)}&assetKey=${encodeURIComponent(
          item.imageAsset.assetKey,
        )}`,
        { headers },
      );
      setHistoryItems(res?.items || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!historyOpen || !historyProduct) return;
    loadHistory(historyProduct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, historyProduct?.product?.id]);

  const loadProductImages = async (item: AdminProductItem) => {
    if (!headers) return;
    const productId = Number(item.product?.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    setImagesLoading(true);
    setError(null);
    try {
      const res = (await apiRequest(withTenantKey(`/api/admin/products/${productId}/images`), { headers })) as ProductImagesPayload;
      setImagesPayload(res);
      setImagesBasePrompt(String(res?.basePrompt || ""));
      setImagesNegativePrompt(String(res?.negativePrompt || ""));

      const slots = Array.isArray(res?.slots) ? res.slots : [];
      const nextOverrides: Record<string, SlotPromptOverrides> = {};
      slots.forEach((slot) => {
        const meta = (slot as any)?.metadata || {};
        nextOverrides[slot.id] = {
          label: String(slot.label || ""),
          angle: typeof meta?.angle === "string" ? String(meta.angle) : "",
          promptOverride: typeof meta?.promptOverride === "string" ? String(meta.promptOverride) : "",
          negativePromptOverride: typeof meta?.negativePromptOverride === "string" ? String(meta.negativePromptOverride) : "",
        };
      });
      setSlotOverridesById(nextOverrides);
      const nextLoading: Record<string, boolean> = {};
      slots.forEach((slot) => {
        nextLoading[String(slot.assetKey)] = true;
      });
      setSlotHistoryLoading(nextLoading);

      const histories = await Promise.all(
        slots.map(async (slot) => {
          try {
            const hx = await apiRequest(
              `/api/admin/assets/images/history?namespace=products&assetKey=${encodeURIComponent(String(slot.assetKey))}`,
              { headers },
            );
            return [String(slot.assetKey), (hx?.items || []) as GeneratedImage[]] as const;
          } catch {
            return [String(slot.assetKey), [] as GeneratedImage[]] as const;
          }
        }),
      );

      const byKey: Record<string, GeneratedImage[]> = {};
      const loadingDone: Record<string, boolean> = {};
      for (const [key, list] of histories) {
        byKey[key] = list;
        loadingDone[key] = false;
      }
      setSlotHistories(byKey);
      setSlotHistoryLoading(loadingDone);
    } catch (err: any) {
      setError(err?.message || "Failed to load product images");
    } finally {
      setImagesLoading(false);
    }
  };

  const refreshImagesPayloadOnly = async () => {
    if (!headers || !imagesProduct?.product?.id) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    const res = (await apiRequest(withTenantKey(`/api/admin/products/${productId}/images`), { headers })) as ProductImagesPayload;
    setImagesPayload(res);
    setSlotOverridesById((prev) => {
      const next: Record<string, SlotPromptOverrides> = { ...prev };
      const slots = Array.isArray(res?.slots) ? res.slots : [];
      const valid = new Set(slots.map((s) => s.id));

      for (const key of Object.keys(next)) {
        if (!valid.has(key)) delete next[key];
      }

      slots.forEach((slot) => {
        const meta = (slot as any)?.metadata || {};
        if (!next[slot.id]) {
          next[slot.id] = {
            label: String(slot.label || ""),
            angle: typeof meta?.angle === "string" ? String(meta.angle) : "",
            promptOverride: typeof meta?.promptOverride === "string" ? String(meta.promptOverride) : "",
            negativePromptOverride: typeof meta?.negativePromptOverride === "string" ? String(meta.negativePromptOverride) : "",
          };
          return;
        }
        next[slot.id] = {
          ...next[slot.id],
          label: String(slot.label || next[slot.id].label || ""),
          angle: typeof meta?.angle === "string" ? String(meta.angle) : next[slot.id].angle,
        };
      });
      return next;
    });
  };

  const refreshSlotHistory = async (assetKey: string) => {
    if (!headers) return;
    const key = String(assetKey || "");
    if (!key) return;
    setSlotHistoryLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const hx = await apiRequest(
        `/api/admin/assets/images/history?namespace=products&assetKey=${encodeURIComponent(key)}`,
        { headers },
      );
      setSlotHistories((prev) => ({ ...prev, [key]: (hx?.items || []) as GeneratedImage[] }));
    } finally {
      setSlotHistoryLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  useEffect(() => {
    if (!imagesOpen || !imagesProduct) return;
    loadProductImages(imagesProduct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesOpen, imagesProduct?.product?.id]);

  const regeneratePrimary = async (productId: number) => {
    if (!headers) return;
    setBusyProductId(productId);
    setError(null);
    try {
      await apiRequest(withTenantKey(`/api/admin/marketplace/products/${productId}/regenerate-primary-image`), {
        method: "POST",
        headers,
      });
      await loadProducts();
      broadcastMarketplaceRefresh();
      if (historyProduct?.product?.id === productId) {
        const refreshed = items.find((it) => Number(it.product?.id) === productId);
        if (refreshed) await loadHistory(refreshed);
      }
    } catch (err: any) {
      setError(err?.message || "Regenerate failed");
    } finally {
      setBusyProductId(null);
    }
  };

  const setActiveFromHistory = async (item: AdminProductItem, imageId: string) => {
    if (!headers) return;
    setHistoryLoading(true);
    setError(null);
    try {
      await apiRequest("/api/admin/assets/images/set-active", {
        method: "POST",
        headers,
        body: JSON.stringify({
          namespace: item.imageAsset.namespace,
          assetKey: item.imageAsset.assetKey,
          imageId,
        }),
      });
      await Promise.all([loadProducts(), loadHistory(item)]);
      broadcastMarketplaceRefresh();
    } catch (err: any) {
      setError(err?.message || "Set active failed");
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveProductImageSettings = async () => {
    if (!headers || !imagesProduct?.product?.id) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    setImagesLoading(true);
    setError(null);
    try {
      await apiRequest(withTenantKey(`/api/admin/products/${productId}/images/update-settings`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          basePrompt: imagesBasePrompt,
          negativePrompt: imagesNegativePrompt,
        }),
      });
      await loadProductImages(imagesProduct);
    } catch (err: any) {
      setError(err?.message || "Failed to save image settings");
    } finally {
      setImagesLoading(false);
    }
  };

  const generateImageSet = async () => {
    if (!headers || !imagesProduct?.product?.id) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    setImagesLoading(true);
    setError(null);
    try {
      await apiRequest(withTenantKey(`/api/admin/products/${productId}/images/generate-set`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          basePrompt: imagesBasePrompt,
          negativePrompt: imagesNegativePrompt,
          preset: imagesPreset === "auto" ? undefined : imagesPreset,
          count: imagesCount,
          setActive: imagesAutoSetActive,
        }),
      });
      await loadProductImages(imagesProduct);
      if (imagesAutoSetActive) broadcastMarketplaceRefresh();
    } catch (err: any) {
      setError(err?.message || "Generate set failed");
    } finally {
      setImagesLoading(false);
    }
  };

  const generateMissingSlotImages = async () => {
    if (!headers || !imagesProduct?.product?.id || !imagesPayload?.slots?.length) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    const missingSlots = [...imagesPayload.slots].filter((slot) => !slot.active?.activeImageId);
    if (!missingSlots.length) return;

    setImagesLoading(true);
    setError(null);
    try {
      const baseOriginal = String(imagesPayload?.basePrompt || "").trim();
      const negativeOriginal = String(imagesPayload?.negativePrompt || "").trim();
      const baseDirty = imagesBasePrompt.trim() !== baseOriginal;
      const negativeDirty = imagesNegativePrompt.trim() !== negativeOriginal;

      for (const slot of missingSlots) {
        const overrides = slotOverridesById[slot.id];
        const slotPrompt = overrides?.promptOverride?.trim() || "";
        const slotNegative = overrides?.negativePromptOverride?.trim() || "";

        const body: any = {
          slotId: slot.id,
          setActive: true,
        };
        if (slotPrompt) body.prompt = slotPrompt;
        else if (baseDirty && imagesBasePrompt.trim()) body.prompt = imagesBasePrompt.trim();
        if (slotNegative) body.negativePrompt = slotNegative;
        else if (negativeDirty && imagesNegativePrompt.trim()) body.negativePrompt = imagesNegativePrompt.trim();

        await apiRequest(withTenantKey(`/api/admin/products/${productId}/images/generate-one`), {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      }

      await loadProductImages(imagesProduct);
      broadcastMarketplaceRefresh();
    } catch (err: any) {
      setError(err?.message || "Generate missing failed");
    } finally {
      setImagesLoading(false);
    }
  };

  const generateSlotImage = async (slot: ProductImageSlot) => {
    if (!headers || !imagesProduct?.product?.id) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    setBusySlotId(slot.id);
    setError(null);
    try {
      const overrides = slotOverridesById[slot.id];
      const slotPrompt = overrides?.promptOverride?.trim() || "";
      const slotNegative = overrides?.negativePromptOverride?.trim() || "";

      const baseOriginal = String(imagesPayload?.basePrompt || "").trim();
      const negativeOriginal = String(imagesPayload?.negativePrompt || "").trim();
      const baseDirty = imagesBasePrompt.trim() !== baseOriginal;
      const negativeDirty = imagesNegativePrompt.trim() !== negativeOriginal;

      const body: any = {
        slotId: slot.id,
        setActive: imagesAutoSetActive,
      };
      if (slotPrompt) body.prompt = slotPrompt;
      else if (baseDirty && imagesBasePrompt.trim()) body.prompt = imagesBasePrompt.trim();
      if (slotNegative) body.negativePrompt = slotNegative;
      else if (negativeDirty && imagesNegativePrompt.trim()) body.negativePrompt = imagesNegativePrompt.trim();

      await apiRequest(withTenantKey(`/api/admin/products/${productId}/images/generate-one`), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      await refreshSlotHistory(slot.assetKey);
      if (imagesAutoSetActive) {
        await refreshImagesPayloadOnly();
        broadcastMarketplaceRefresh();
      }
    } catch (err: any) {
      setError(err?.message || "Generate failed");
    } finally {
      setBusySlotId(null);
    }
  };

  const saveSlotOverrides = async (slot: ProductImageSlot) => {
    if (!headers || !imagesProduct?.product?.id) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;

    const draft = slotOverridesById[slot.id] || {
      label: String(slot.label || ""),
      angle: typeof (slot.metadata as any)?.angle === "string" ? String((slot.metadata as any).angle) : "",
      promptOverride: "",
      negativePromptOverride: "",
    };

    setBusySlotId(slot.id);
    setError(null);
    try {
      const res = await apiRequest(withTenantKey(`/api/admin/products/${productId}/images/update-slot`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          slotId: slot.id,
          label: draft.label,
          angle: draft.angle,
          promptOverride: draft.promptOverride,
          negativePromptOverride: draft.negativePromptOverride,
        }),
      });

      const nextMeta = res?.metadata || {};
      const nextLabel = res?.label ?? slot.label ?? null;

      setImagesPayload((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          slots: (prev.slots || []).map((s) => (s.id === slot.id ? { ...s, label: nextLabel, metadata: nextMeta } : s)),
        };
      });

      setSlotOverridesById((prev) => ({
        ...prev,
        [slot.id]: {
          ...draft,
          label: nextLabel ? String(nextLabel) : "",
          angle: typeof nextMeta?.angle === "string" ? String(nextMeta.angle) : draft.angle,
          promptOverride: typeof nextMeta?.promptOverride === "string" ? String(nextMeta.promptOverride) : "",
          negativePromptOverride: typeof nextMeta?.negativePromptOverride === "string" ? String(nextMeta.negativePromptOverride) : "",
        },
      }));
    } catch (err: any) {
      setError(err?.message || "Failed to save slot overrides");
    } finally {
      setBusySlotId(null);
    }
  };

  const suggestPromptForSlot = async (slot: ProductImageSlot) => {
    if (!headers || !imagesProduct?.product?.id) return;
    setBusySlotId(slot.id);
    setError(null);
    try {
      const descriptionParts = [
        imagesProduct?.product?.name ? `Product: ${imagesProduct.product.name}` : null,
        slot.label ? `Slot: ${slot.label}` : `Slot role: ${slot.role}`,
        slotOverridesById[slot.id]?.angle ? `Camera angle: ${slotOverridesById[slot.id].angle}` : null,
      ].filter(Boolean);

      const res = await apiRequest("/api/admin/assets/images/suggest-prompt", {
        method: "POST",
        headers,
        body: JSON.stringify({
          namespace: "products",
          assetKey: String(slot.assetKey),
          aspect: imagesPayload?.aspect,
          description: descriptionParts.join(" | "),
        }),
      });

      const prompt = String(res?.prompt || "").trim();
      if (!prompt) return;
      setSlotOverridesById((prev) => ({
        ...prev,
        [slot.id]: {
          ...(prev[slot.id] || {
            label: String(slot.label || ""),
            angle: typeof (slot.metadata as any)?.angle === "string" ? String((slot.metadata as any).angle) : "",
            promptOverride: "",
            negativePromptOverride: "",
          }),
          promptOverride: prompt,
        },
      }));
    } catch (err: any) {
      setError(err?.message || "Prompt suggestion failed");
    } finally {
      setBusySlotId(null);
    }
  };

  const openPromptEditorForImage = (slot: ProductImageSlot, img: GeneratedImage) => {
    if (!imagesProduct?.product?.id) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;

    setPromptEditor({
      productId,
      slotId: slot.id,
      assetKey: String(slot.assetKey),
      slotLabel: String(slot.label || slot.role || "Image"),
      imageId: img.id,
      model: String(img.model || "image"),
      prompt: String(img.prompt || ""),
      negativePrompt: String(img.negativePrompt || ""),
    });
    setPromptEditorOpen(true);
  };

  const regenerateFromPromptEditor = async () => {
    if (!headers || !promptEditor) return;
    setPromptEditorBusy(true);
    setError(null);
    try {
      await apiRequest(withTenantKey(`/api/admin/products/${promptEditor.productId}/images/generate-one`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          slotId: promptEditor.slotId,
          setActive: imagesAutoSetActive,
          prompt: promptEditor.prompt,
          negativePrompt: promptEditor.negativePrompt,
        }),
      });
      await refreshSlotHistory(promptEditor.assetKey);
      if (imagesAutoSetActive) await refreshImagesPayloadOnly();
    } catch (err: any) {
      setError(err?.message || "Regenerate failed");
    } finally {
      setPromptEditorBusy(false);
    }
  };

  const savePromptAsSlotDefault = async () => {
    if (!headers || !promptEditor) return;
    setPromptEditorBusy(true);
    setError(null);
    try {
      const res = await apiRequest(withTenantKey(`/api/admin/products/${promptEditor.productId}/images/update-slot`), {
        method: "POST",
        headers,
        body: JSON.stringify({
          slotId: promptEditor.slotId,
          promptOverride: promptEditor.prompt,
          negativePromptOverride: promptEditor.negativePrompt,
        }),
      });
      const nextMeta = res?.metadata || {};
      setImagesPayload((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          slots: (prev.slots || []).map((s) => (s.id === promptEditor.slotId ? { ...s, metadata: nextMeta } : s)),
        };
      });
      setSlotOverridesById((prev) => ({
        ...prev,
        [promptEditor.slotId]: {
          ...(prev[promptEditor.slotId] || { label: promptEditor.slotLabel, angle: "", promptOverride: "", negativePromptOverride: "" }),
          promptOverride: typeof nextMeta?.promptOverride === "string" ? String(nextMeta.promptOverride) : "",
          negativePromptOverride: typeof nextMeta?.negativePromptOverride === "string" ? String(nextMeta.negativePromptOverride) : "",
        },
      }));
    } catch (err: any) {
      setError(err?.message || "Failed to save slot prompt");
    } finally {
      setPromptEditorBusy(false);
    }
  };

  const uploadSlotImage = async (slot: ProductImageSlot, file: File | null) => {
    if (!token || !file || !imagesProduct?.product?.id) return;
    setBusySlotId(slot.id);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("namespace", "products");
      fd.append("assetKey", String(slot.assetKey));
      fd.append("setActive", String(imagesAutoSetActive));
      const res = await fetch("/api/admin/assets/images/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }
      await refreshSlotHistory(slot.assetKey);
      if (imagesAutoSetActive) {
        await refreshImagesPayloadOnly();
        broadcastMarketplaceRefresh();
      }
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setBusySlotId(null);
    }
  };

  const setActiveForSlot = async (assetKey: string, imageId: string) => {
    if (!headers || !imagesProduct) return;
    setBusySlotId(imageId);
    setError(null);
    try {
      await apiRequest("/api/admin/assets/images/set-active", {
        method: "POST",
        headers,
        body: JSON.stringify({ namespace: "products", assetKey, imageId }),
      });
      await refreshSlotHistory(assetKey);
      await refreshImagesPayloadOnly();
      broadcastMarketplaceRefresh();
    } catch (err: any) {
      setError(err?.message || "Set active failed");
    } finally {
      setBusySlotId(null);
    }
  };

  const setPrimaryFromImage = async (imageId: string) => {
    if (!headers || !imagesProduct?.product?.id) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    setBusySlotId(imageId);
    setError(null);
    try {
      await apiRequest(withTenantKey(`/api/admin/products/${productId}/images/set-primary`), {
        method: "POST",
        headers,
        body: JSON.stringify({ imageId }),
      });
      await refreshImagesPayloadOnly();
      broadcastMarketplaceRefresh();
    } catch (err: any) {
      setError(err?.message || "Set primary failed");
    } finally {
      setBusySlotId(null);
    }
  };

  const reorderSlots = async (orderedSlotIds: string[]) => {
    if (!headers || !imagesProduct?.product?.id) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    setImagesLoading(true);
    setError(null);
    try {
      await apiRequest(withTenantKey(`/api/admin/products/${productId}/images/reorder`), {
        method: "POST",
        headers,
        body: JSON.stringify({ orderedImageIds: orderedSlotIds }),
      });
      await refreshImagesPayloadOnly();
      broadcastMarketplaceRefresh();
    } catch (err: any) {
      setError(err?.message || "Reorder failed");
    } finally {
      setImagesLoading(false);
    }
  };

  const deleteSlot = async (slotId: string) => {
    if (!headers || !imagesProduct?.product?.id) return;
    const productId = Number(imagesProduct.product.id);
    if (!Number.isFinite(productId) || productId <= 0) return;
    const previousAssetKey = imagesPayload?.slots?.find((s) => s.id === slotId)?.assetKey;
    setBusySlotId(slotId);
    setError(null);
    try {
      await apiRequest(withTenantKey(`/api/admin/products/${productId}/images/${encodeURIComponent(slotId)}`), {
        method: "DELETE",
        headers,
      });
      await refreshImagesPayloadOnly();
      broadcastMarketplaceRefresh();
      if (previousAssetKey) {
        const key = String(previousAssetKey);
        setSlotHistories((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setSlotHistoryLoading((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    } catch (err: any) {
      setError(err?.message || "Delete failed");
    } finally {
      setBusySlotId(null);
    }
  };

  const runBackfillMismatch = async () => {
    if (!headers) return;
    setBackfillRunning(true);
    setError(null);
    try {
      const res = await apiRequest(withTenantKey("/api/admin/products/images/backfill-mismatch"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...(tenantKey ? { tenantKey } : {}),
          ...(categoryId ? { categoryId } : {}),
          scanLimit: 1000,
          maxRegenerate: 20,
          onlyMissing: true,
        }),
      });
      setBackfillResult(res);
      setBackfillOpen(true);
      await loadProducts();
    } catch (err: any) {
      setError(err?.message || "Backfill failed");
    } finally {
      setBackfillRunning(false);
    }
  };

  const suggestProductField = async (field: "name" | "shortDescription" | "description" | "tags") => {
    if (!headers || !editProduct?.id) return;
    setSuggestBusyField(field);
    setError(null);
    try {
      const draft = {
        name: editForm.name,
        slug: editForm.slug,
        shortDescription: editForm.shortDescription,
        description: editForm.description,
        tags: parseTagsCsv(editForm.tagsCsv),
        categoryId: editForm.categoryId ? Number(editForm.categoryId) : null,
        sellerId: editForm.sellerId ? Number(editForm.sellerId) : null,
      };

      const res = await apiRequest(withTenantKey(`/api/admin/marketplace/products/${editProduct.id}/suggest`), {
        method: "POST",
        headers,
        body: JSON.stringify({ field, draft }),
      });

      const value = String(res?.value || "").trim();
      if (!value) return;
      if (field === "tags") {
        setEditForm((p) => ({ ...p, tagsCsv: value }));
      } else {
        setEditForm((p) => ({ ...p, [field]: value } as any));
      }
    } catch (err: any) {
      setError(err?.message || "Suggest failed");
    } finally {
      setSuggestBusyField(null);
    }
  };

  const saveEdit = async () => {
    if (!headers || !editProduct?.id) return;
    setBusyProductId(Number(editProduct.id));
    setError(null);
    try {
      const name = editForm.name.trim();
      if (!name) throw new Error("Name is required");
      const slug = editForm.slug.trim() || slugify(name);
      if (!slug) throw new Error("Slug is required");
      const price = editForm.price.trim();
      if (!price) throw new Error("Price is required");

      const sellerIdValue = editForm.sellerId ? Number(editForm.sellerId) : null;
      if (!sellerIdValue) throw new Error("Seller is required");

      const baseAttributes = parseJsonField(editForm.attributesJson, "Attributes");
      const nextAttributes =
        baseAttributes && typeof baseAttributes === "object" && !Array.isArray(baseAttributes) ? ({ ...baseAttributes } as any) : ({} as any);

      const trimmedVideoUrl = editForm.videoUrl.trim();
      if (trimmedVideoUrl) nextAttributes.videoUrl = trimmedVideoUrl;
      else delete nextAttributes.videoUrl;

      const videos = editForm.videosCsv
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (videos.length) nextAttributes.videos = videos;
      else delete nextAttributes.videos;

      const cleanedI18n = cleanProductI18n(editI18n);
      if (Object.keys(cleanedI18n).length) nextAttributes.i18n = cleanedI18n;
      else delete nextAttributes.i18n;

      const payload = {
        name,
        slug,
        status: editForm.status,
        sellerId: sellerIdValue,
        categoryId: editForm.categoryId ? Number(editForm.categoryId) : null,

        price,
        currency: editForm.currency.trim() || "XOF",
        compareAtPrice: editForm.compareAtPrice.trim() || null,
        costPrice: editForm.costPrice.trim() || null,

        sku: editForm.sku.trim() || null,
        barcode: editForm.barcode.trim() || null,

        stockQuantity: parseIntField(editForm.stockQuantity),
        lowStockThreshold: parseIntField(editForm.lowStockThreshold),
        trackInventory: Boolean(editForm.trackInventory),
        allowBackorder: Boolean(editForm.allowBackorder),

        weight: editForm.weight.trim() || null,
        weightUnit: editForm.weightUnit.trim() || null,
        dimensions: parseJsonField(editForm.dimensionsJson, "Dimensions"),

        shortDescription: editForm.shortDescription.trim() || null,
        description: editForm.description.trim() || null,
        tags: parseTagsCsv(editForm.tagsCsv),

        isHandmade: Boolean(editForm.isHandmade),
        productionTime: editForm.productionTime.trim() || null,

        ingredients: parseJsonField(editForm.ingredientsJson, "Ingredients"),
        allergens: parseJsonField(editForm.allergensJson, "Allergens"),
        certifications: parseJsonField(editForm.certificationsJson, "Certifications"),
        attributes: nextAttributes,
      };

      await apiRequest(withTenantKey(`/api/admin/marketplace/products/${editProduct.id}`), {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
      await loadProducts();
      broadcastMarketplaceRefresh();
      closeEdit();
    } catch (err: any) {
      setError(err?.message || "Save failed");
    } finally {
      setBusyProductId(null);
    }
  };

  const editProductId = editProduct?.id ? Number(editProduct.id) : null;
  const editPrimaryImageUrlRaw = editProduct ? pickFirstImage(editProduct.images) : null;
  const editPrimaryImageUrl = editPrimaryImageUrlRaw ? absolutizePublicUrl(editPrimaryImageUrlRaw) : null;
  const editPrimaryPlaceholderUrl = editProduct ? buildProductPlaceholder(editProduct, "Product", 1, null) : null;
  const editSlotCount = Array.isArray(editProduct?.attributes?.imageSlots) ? editProduct.attributes.imageSlots.length : null;
  const editCategorySlug = useMemo(() => {
    const rawId = editForm.categoryId || (editProduct as any)?.categoryId || "";
    const id = rawId ? Number(rawId) : null;
    if (!id || !Number.isFinite(id)) return "";
    const c = categories.find((x) => Number(x.id) === id);
    return String(c?.slug || "");
  }, [categories, editForm.categoryId, editProduct]);
  const editIsStampedGold = editCategorySlug === "stamped";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-white">Admin &gt; Marketplace &gt; Products</h1>
          <div className="text-sm text-gray-400">Manage products, sellers, and images (regenerate + history + set active).</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={runBackfillMismatch} disabled={!headers || backfillRunning}>
            {backfillRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Generate missing images
          </Button>
          <Button variant="secondary" onClick={() => loadProducts({ offset: 0, append: false })} disabled={!headers || loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>}

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs text-gray-300">Search</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="bg-slate-900 border-slate-800 text-white" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-300">Tenant</Label>
            <select
              className="h-10 w-full rounded-md bg-slate-900 border border-slate-800 text-white text-sm px-3"
              value={tenantKey}
              onChange={(e) => {
                const next = e.target.value;
                setTenantKey(next);
                setCategoryId("");
                setSellerId("");
                setEditOpen(false);
                setEditProduct(null);
                setHistoryOpen(false);
                setHistoryProduct(null);
                setHistoryItems([]);
                setImagesOpen(false);
                setImagesProduct(null);
                setImagesPayload(null);
                setLocation(buildQuery(location, { tenantKey: next || null, edit: null, history: null, images: null }));
              }}
            >
              <option value="">Current</option>
              <option value="bdo">Bourse de l'Or</option>
              <option value="bourse">Bourse (legacy)</option>
              <option value="exportunity">Exportunity</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-300">Category</Label>
            <select
              className="h-10 w-full rounded-md bg-slate-900 border border-slate-800 text-white text-sm px-3"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} ({c.slug})
                </option>
              ))}
            </select>
          </div>

          {quickGoldCategories.length ? (
            <div className="md:col-span-6 flex items-center gap-2 flex-wrap rounded-lg border border-slate-800 bg-slate-950/40 p-2">
              <div className="text-xs text-gray-400">Gold quick filters</div>
              <div className="flex items-center gap-2 flex-wrap">
                {quickGoldCategories.map((c) => {
                  const active = categoryId === String(c.id);
                  return (
                    <Button
                      key={c.slug}
                      size="sm"
                      variant={active ? "default" : "secondary"}
                      className={active ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
                      onClick={() => setCategoryId(active ? "" : String(c.id))}
                    >
                      {c.name}
                    </Button>
                  );
                })}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Checkbox
                  checked={hasImage === "false"}
                  onCheckedChange={(checked) => setHasImage(checked === true ? "false" : "")}
                />
                <span className="text-xs text-gray-300">Missing images only</span>
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label className="text-xs text-gray-300">Seller</Label>
            <select
              className="h-10 w-full rounded-md bg-slate-900 border border-slate-800 text-white text-sm px-3"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
            >
              <option value="">All</option>
              {sellers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.shopName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-300">Has image</Label>
            <select
              className="h-10 w-full rounded-md bg-slate-900 border border-slate-800 text-white text-sm px-3"
              value={hasImage}
              onChange={(e) => setHasImage(e.target.value)}
            >
              <option value="">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-300">Status</Label>
            <select
              className="h-10 w-full rounded-md bg-slate-900 border border-slate-800 text-white text-sm px-3"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-300">Created from</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900 border-slate-800 text-white" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-300">Created to</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900 border-slate-800 text-white" />
          </div>

          <div className="md:col-span-6 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-300">Per page</Label>
              <select
                className="h-9 rounded-md bg-slate-900 border border-slate-800 text-white text-sm px-3"
                value={String(limit)}
                onChange={(e) => {
                  const next = Math.max(1, Math.min(parseInt(e.target.value, 10) || 100, 200));
                  setLimit(next);
                  setOffset(0);
                  setHasMore(false);
                }}
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setQ("");
                  setCategoryId("");
                  setSellerId("");
                  setStatus("");
                  setHasImage("");
                  setFrom("");
                  setTo("");
                  setOffset(0);
                  setHasMore(false);
                }}
              >
                Reset
              </Button>
              <Button
                onClick={() => {
                  setItems([]);
                  setOffset(0);
                  setHasMore(false);
                  loadProducts({ offset: 0, append: false });
                }}
                disabled={!headers || loading}
              >
                Apply
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && items.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-400">No products match these filters.</div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const product = item.product;
                const imageUrlRaw = pickFirstImage(product?.images);
                const imageUrl = imageUrlRaw ? absolutizePublicUrl(imageUrlRaw) : null;
                const isMissingImage = !imageUrlRaw;
                const placeholderUrl = buildProductPlaceholder(product, item.category?.name || "Product", 0, null);
                const slotCount = Array.isArray(product?.attributes?.imageSlots) ? product.attributes.imageSlots.length : null;
                const hasVideo =
                  typeof product?.attributes?.videoUrl === "string" ||
                  (Array.isArray(product?.attributes?.videos) && typeof product.attributes.videos[0] === "string");
                const id = Number(product?.id);
                const validId = Number.isInteger(id) && id > 0 ? id : null;
                const isBusy = validId != null && busyProductId === validId;
                const viewHref = validId != null ? `/product/${encodeURIComponent(String(validId))}` : "#";
                const sellerHref = item.seller?.id ? `/marketplace/sellers?sellerId=${encodeURIComponent(String(item.seller.id))}` : "/marketplace/sellers";
                const rowKey = validId != null ? `product-${validId}` : `product-${String(product?.id || item.imageAsset.assetKey)}`;

                return (
                  <div key={rowKey} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex-shrink-0">
                          <img
                            src={imageUrl || placeholderUrl}
                            alt={product?.name || "product"}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = placeholderUrl;
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-sm font-semibold text-white truncate">{product?.name || `Product #${id}`}</div>
                            <Badge variant="outline" className="text-[11px] border-slate-700 text-gray-300">
                              {product?.status || "unknown"}
                            </Badge>
                            {isMissingImage ? (
                              <Badge className="text-[11px] bg-amber-500/15 text-amber-200 border border-amber-500/30">
                                No image
                              </Badge>
                            ) : null}
                            {item.category?.name ? (
                              <Badge
                                variant="secondary"
                                className="text-[11px] bg-slate-800 text-gray-200"
                                title={item.category.slug}
                              >
                                {item.category.name}
                                {item.category.slug ? ` (${item.category.slug})` : ""}
                              </Badge>
                            ) : null}
                            {typeof slotCount === "number" ? (
                              <Badge variant="outline" className="text-[11px] border-slate-700 text-gray-300">
                                {slotCount} imgs
                              </Badge>
                            ) : null}
                            {hasVideo ? (
                              <Badge variant="outline" className="text-[11px] border-slate-700 text-gray-300">
                                Video
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-400">
                            Seller:{" "}
                            <a className="text-amber-300 hover:underline" href={sellerHref}>
                              {item.seller?.shopName || "Unknown"}
                            </a>
                          </div>
                          <div className="text-xs text-gray-500 truncate">Asset: {item.imageAsset.namespace}/{item.imageAsset.assetKey}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <a
                          className="text-xs text-amber-300 hover:underline"
                          href={viewHref}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => {
                            if (!validId) event.preventDefault();
                          }}
                        >
                          View
                        </a>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            openEditFromItem(item);
                            if (validId != null) openEdit(validId);
                          }}
                          disabled={!headers}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            openHistoryFromItem(item);
                            if (validId != null) openHistory(validId);
                          }}
                          disabled={!headers}
                        >
                          History
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            openImagesFromItem(item);
                            if (validId != null) openImages(validId);
                          }}
                          disabled={!headers}
                        >
                          Images
                        </Button>
                        <Button size="sm" onClick={() => (validId != null ? regeneratePrimary(validId) : null)} disabled={!headers || isBusy || validId == null}>
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                          {isMissingImage ? "Generate image" : "Regenerate image"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-xs text-gray-400">
                  Showing <span className="text-gray-200">{items.length}</span> item(s){hasMore ? "+" : ""} â€¢ Page size{" "}
                  <span className="text-gray-200">{limit}</span>
                </div>
                {hasMore ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => loadProducts({ offset: offset + limit, append: true })}
                    disabled={!headers || loading}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : null}
                    Load more
                  </Button>
                ) : (
                  <div className="text-xs text-gray-500">End of list</div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={(open) => (open ? null : closeEdit())}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
            <DialogDescription className="text-gray-400">Full admin edit (details, pricing, inventory, tags, image prompts).</DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>
          ) : null}

          <div className="space-y-6">
            {editIsStampedGold ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-amber-200">Stamped Gold product</div>
                  <div className="text-xs text-amber-100/80">
                    Legal stamp fields (coin/bar, purity, hallmark, serial prefix) are managed in <span className="text-amber-100">Stamped Gold SKUs</span>.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const qs = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";
                    setLocation(`/admin/stamped-gold/skus${qs}`);
                  }}
                >
                  Open SKU manager
                </Button>
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex-shrink-0">
                  {editPrimaryPlaceholderUrl ? (
                    <img
                      src={editPrimaryImageUrl || editPrimaryPlaceholderUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = editPrimaryPlaceholderUrl;
                      }}
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">Images</div>
                  <div className="text-xs text-gray-400">
                    {typeof editSlotCount === "number" ? `${editSlotCount} slots` : "Manage primary + gallery images."}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => (editProductId ? switchEditToImages(editProductId) : null)}
                disabled={!headers || !editProductId}
              >
                Open image manager
              </Button>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">Video</div>
                  <div className="text-xs text-gray-400">Optional. Displays on product pages and feeds.</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const url = editForm.videoUrl.trim();
                      if (!url) return;
                      window.open(url, "_blank", "noreferrer");
                    }}
                    disabled={!editForm.videoUrl.trim()}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditForm((p) => ({ ...p, videoUrl: "", videosCsv: "" }))}
                    disabled={!editForm.videoUrl.trim() && !editForm.videosCsv.trim()}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-sm text-gray-300">Primary video URL</Label>
                  <Input
                    value={editForm.videoUrl}
                    onChange={(e) => setEditForm((p) => ({ ...p, videoUrl: e.target.value }))}
                    placeholder="https://..."
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-gray-300">Additional videos (1 per line)</Label>
                  <Textarea
                    value={editForm.videosCsv}
                    onChange={(e) => setEditForm((p) => ({ ...p, videosCsv: e.target.value }))}
                    placeholder="https://...\nhttps://..."
                    className="bg-slate-900 border-slate-800 text-white min-h-[96px]"
                  />
                </div>
              </div>

              <div className="text-xs text-gray-500">
                Stored in product attributes as <span className="text-gray-300">videoUrl</span> and <span className="text-gray-300">videos</span>.
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm text-gray-300">Name</Label>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => suggestProductField("name")}
                    disabled={!headers || suggestBusyField !== null}
                    title="Suggest"
                  >
                    {suggestBusyField === "name" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  </Button>
                </div>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className="bg-slate-900 border-slate-800 text-white"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm text-gray-300">Slug</Label>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditForm((p) => ({ ...p, slug: slugify(p.slug.trim() || p.name) }))}
                    disabled={!editForm.name.trim() && !editForm.slug.trim()}
                  >
                    Auto
                  </Button>
                </div>
                <Input
                  value={editForm.slug}
                  onChange={(e) => setEditForm((p) => ({ ...p, slug: e.target.value }))}
                  className="bg-slate-900 border-slate-800 text-white"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-sm text-gray-300">Seller</Label>
                <select
                  className="h-10 w-full rounded-md bg-slate-900 border border-slate-800 text-white text-sm px-3"
                  value={editForm.sellerId}
                  onChange={(e) => setEditForm((p) => ({ ...p, sellerId: e.target.value }))}
                >
                  <option value="">Select seller...</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.shopName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-300">Category</Label>
                <select
                  className="h-10 w-full rounded-md bg-slate-900 border border-slate-800 text-white text-sm px-3"
                  value={editForm.categoryId}
                  onChange={(e) => setEditForm((p) => ({ ...p, categoryId: e.target.value }))}
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name} ({c.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-300">Status</Label>
                <select
                  className="h-10 w-full rounded-md bg-slate-900 border border-slate-800 text-white text-sm px-3"
                  value={editForm.status}
                  onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-sm text-gray-300">Price</Label>
                <Input
                  value={editForm.price}
                  onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))}
                  className="bg-slate-900 border-slate-800 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-300">Currency</Label>
                <Input
                  value={editForm.currency}
                  onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value }))}
                  className="bg-slate-900 border-slate-800 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-300">Compare at</Label>
                <Input
                  value={editForm.compareAtPrice}
                  onChange={(e) => setEditForm((p) => ({ ...p, compareAtPrice: e.target.value }))}
                  className="bg-slate-900 border-slate-800 text-white"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-sm text-gray-300">Cost</Label>
                <Input
                  value={editForm.costPrice}
                  onChange={(e) => setEditForm((p) => ({ ...p, costPrice: e.target.value }))}
                  className="bg-slate-900 border-slate-800 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-300">SKU</Label>
                <Input
                  value={editForm.sku}
                  onChange={(e) => setEditForm((p) => ({ ...p, sku: e.target.value }))}
                  className="bg-slate-900 border-slate-800 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-300">Barcode</Label>
                <Input
                  value={editForm.barcode}
                  onChange={(e) => setEditForm((p) => ({ ...p, barcode: e.target.value }))}
                  className="bg-slate-900 border-slate-800 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm text-gray-300">Short description</Label>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => suggestProductField("shortDescription")}
                  disabled={!headers || suggestBusyField !== null}
                  title="Suggest"
                >
                  {suggestBusyField === "shortDescription" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Textarea
                value={editForm.shortDescription}
                onChange={(e) => setEditForm((p) => ({ ...p, shortDescription: e.target.value }))}
                rows={2}
                className="bg-slate-900 border-slate-800 text-white text-sm"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm text-gray-300">Description</Label>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => suggestProductField("description")}
                  disabled={!headers || suggestBusyField !== null}
                  title="Suggest"
                >
                  {suggestBusyField === "description" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                </Button>
              </div>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                rows={6}
                className="bg-slate-900 border-slate-800 text-white text-sm"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm text-gray-300">Tags (comma-separated)</Label>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => suggestProductField("tags")}
                  disabled={!headers || suggestBusyField !== null}
                  title="Suggest"
                >
                  {suggestBusyField === "tags" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                </Button>
              </div>
              <Input
                value={editForm.tagsCsv}
                onChange={(e) => setEditForm((p) => ({ ...p, tagsCsv: e.target.value }))}
                className="bg-slate-900 border-slate-800 text-white"
              />
            </div>

            <div className="rounded-xl border border-slate-800 bg-black/20 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">Translations</div>
                  <div className="text-xs text-gray-400">
                    Optional localized text shown to buyers when they switch language.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(["en", "fr", "ar"] as const).map((lang) => (
                    <Button
                      key={`i18n-${lang}`}
                      type="button"
                      size="sm"
                      variant={editI18nLang === lang ? "default" : "secondary"}
                      onClick={() => setEditI18nLang(lang)}
                    >
                      {lang.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Name ({editI18nLang.toUpperCase()})</Label>
                  <Input
                    value={editI18n[editI18nLang]?.name ?? ""}
                    onChange={(e) =>
                      setEditI18n((prev) => ({
                        ...prev,
                        [editI18nLang]: { ...(prev[editI18nLang] || {}), name: e.target.value },
                      }))
                    }
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Short description ({editI18nLang.toUpperCase()})</Label>
                  <Textarea
                    value={editI18n[editI18nLang]?.shortDescription ?? ""}
                    onChange={(e) =>
                      setEditI18n((prev) => ({
                        ...prev,
                        [editI18nLang]: { ...(prev[editI18nLang] || {}), shortDescription: e.target.value },
                      }))
                    }
                    rows={2}
                    className="bg-slate-900 border-slate-800 text-white text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-300">Description ({editI18nLang.toUpperCase()})</Label>
                <Textarea
                  value={editI18n[editI18nLang]?.description ?? ""}
                  onChange={(e) =>
                    setEditI18n((prev) => ({
                      ...prev,
                      [editI18nLang]: { ...(prev[editI18nLang] || {}), description: e.target.value },
                    }))
                  }
                  rows={4}
                  className="bg-slate-900 border-slate-800 text-white text-sm"
                />
              </div>

              <div className="text-xs text-gray-500">
                Stored in product attributes as <span className="text-gray-300">i18n.{editI18nLang}</span>.
              </div>
            </div>

            <details className="rounded-xl border border-slate-800 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm text-gray-200 select-none">Inventory & shipping</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Stock</Label>
                  <Input
                    value={editForm.stockQuantity}
                    onChange={(e) => setEditForm((p) => ({ ...p, stockQuantity: e.target.value }))}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Low stock threshold</Label>
                  <Input
                    value={editForm.lowStockThreshold}
                    onChange={(e) => setEditForm((p) => ({ ...p, lowStockThreshold: e.target.value }))}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Weight</Label>
                  <Input
                    value={editForm.weight}
                    onChange={(e) => setEditForm((p) => ({ ...p, weight: e.target.value }))}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Weight unit</Label>
                  <Input
                    value={editForm.weightUnit}
                    onChange={(e) => setEditForm((p) => ({ ...p, weightUnit: e.target.value }))}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-track-inventory"
                      checked={editForm.trackInventory}
                      onCheckedChange={(v) => setEditForm((p) => ({ ...p, trackInventory: v === true }))}
                    />
                    <Label htmlFor="edit-track-inventory" className="text-xs text-gray-300 cursor-pointer">
                      Track inventory
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-allow-backorder"
                      checked={editForm.allowBackorder}
                      onCheckedChange={(v) => setEditForm((p) => ({ ...p, allowBackorder: v === true }))}
                    />
                    <Label htmlFor="edit-allow-backorder" className="text-xs text-gray-300 cursor-pointer">
                      Allow backorder
                    </Label>
                  </div>
                </div>

                <div className="md:col-span-4 space-y-2">
                  <Label className="text-xs text-gray-300">Dimensions (JSON)</Label>
                  <Textarea
                    value={editForm.dimensionsJson}
                    onChange={(e) => setEditForm((p) => ({ ...p, dimensionsJson: e.target.value }))}
                    rows={4}
                    className="bg-slate-900 border-slate-800 text-white text-xs font-mono"
                    placeholder='{"width":10,"height":12,"depth":2,"unit":"cm"}'
                  />
                </div>
              </div>
            </details>

            <details className="rounded-xl border border-slate-800 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm text-gray-200 select-none">Advanced (JSON)</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-300">Attributes (JSON)</Label>
                  <Textarea
                    value={editForm.attributesJson}
                    onChange={(e) => setEditForm((p) => ({ ...p, attributesJson: e.target.value }))}
                    rows={8}
                    className="bg-slate-900 border-slate-800 text-white text-xs font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-300">Certifications (JSON)</Label>
                  <Textarea
                    value={editForm.certificationsJson}
                    onChange={(e) => setEditForm((p) => ({ ...p, certificationsJson: e.target.value }))}
                    rows={8}
                    className="bg-slate-900 border-slate-800 text-white text-xs font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-300">Ingredients (JSON)</Label>
                  <Textarea
                    value={editForm.ingredientsJson}
                    onChange={(e) => setEditForm((p) => ({ ...p, ingredientsJson: e.target.value }))}
                    rows={6}
                    className="bg-slate-900 border-slate-800 text-white text-xs font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-300">Allergens (JSON)</Label>
                  <Textarea
                    value={editForm.allergensJson}
                    onChange={(e) => setEditForm((p) => ({ ...p, allergensJson: e.target.value }))}
                    rows={6}
                    className="bg-slate-900 border-slate-800 text-white text-xs font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-300">Production time</Label>
                  <Input
                    value={editForm.productionTime}
                    onChange={(e) => setEditForm((p) => ({ ...p, productionTime: e.target.value }))}
                    className="bg-slate-900 border-slate-800 text-white"
                    placeholder="e.g. 2–4 days"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    id="edit-is-handmade"
                    checked={editForm.isHandmade}
                    onCheckedChange={(v) => setEditForm((p) => ({ ...p, isHandmade: v === true }))}
                  />
                  <Label htmlFor="edit-is-handmade" className="text-xs text-gray-300 cursor-pointer">
                    Handmade
                  </Label>
                </div>
              </div>
            </details>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={!headers || busyProductId === Number(editProduct?.id)}>
              {busyProductId === Number(editProduct?.id) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyOpen}
        onOpenChange={(open) => {
          if (!open) closeHistory();
        }}
      >
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle>Image history</DialogTitle>
            <DialogDescription className="text-gray-400">
              {historyProduct?.product?.name ? `Product: ${historyProduct.product.name}` : "History for selected product."}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500 truncate">
              {historyProduct ? `${historyProduct.imageAsset.namespace}/${historyProduct.imageAsset.assetKey}` : null}
            </div>
            <div className="flex items-center gap-2">
              {historyProduct?.product?.id ? (
                <Button size="sm" variant="secondary" onClick={() => regeneratePrimary(Number(historyProduct.product.id))} disabled={historyLoading}>
                  Regenerate
                </Button>
              ) : null}
              {historyProduct ? (
                <Button size="sm" variant="secondary" onClick={() => loadHistory(historyProduct)} disabled={historyLoading}>
                  Refresh
                </Button>
              ) : null}
            </div>
          </div>

          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : historyItems.length === 0 ? (
            <div className="text-sm text-gray-400">No history yet.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {historyItems.map((img) => (
                <div key={img.id} className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
                  <div className="h-44 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
                    {img.storedUrl ? (
                      <img src={absolutizePublicUrl(img.storedUrl)} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{img.model || "image"}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {img.status || "unknown"}
                          {img.error ? ` • ${img.error}` : null}
                        </div>
                      </div>
                      {historyProduct ? (
                        <Button size="sm" onClick={() => setActiveFromHistory(historyProduct, img.id)} disabled={historyLoading}>
                          Set active
                        </Button>
                      ) : null}
                    </div>
                    {img.storedUrl ? (
                      <a
                        className="text-xs text-amber-300 hover:underline"
                        href={absolutizePublicUrl(img.storedUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open file
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeHistory}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={imagesOpen}
        onOpenChange={(open) => {
          if (!open) closeImages();
        }}
      >
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <DialogTitle>Product image manager</DialogTitle>
                <DialogDescription className="text-gray-400">
                  {imagesProduct?.product?.name ? `Product: ${imagesProduct.product.name}` : "Manage product images."}
                </DialogDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const pid = Number(imagesProduct?.product?.id);
                    if (!Number.isFinite(pid) || pid <= 0) return;
                    switchImagesToEdit(pid);
                  }}
                  disabled={!imagesProduct?.product?.id}
                >
                  Edit product
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const pid = Number(imagesProduct?.product?.id);
                    if (!Number.isFinite(pid) || pid <= 0) return;
                    window.open(`/product/${pid}`, "_blank", "noreferrer");
                  }}
                  disabled={!imagesProduct?.product?.id}
                >
                  View
                </Button>
              </div>
            </div>
          </DialogHeader>

          {error ? (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>
          ) : null}

          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="text-xs text-gray-500 space-y-1">
                <div>
                  {imagesPayload?.primaryAssetKey
                    ? `Primary assetKey: products/${imagesPayload.primaryAssetKey}`
                    : "Loading image slots..."}
                </div>
                {imagesPayload?.categorySlug ? (
                  <div>
                    Category: <span className="text-gray-300">{imagesPayload.categorySlug}</span>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="product-images-auto-set"
                    checked={imagesAutoSetActive}
                    onCheckedChange={(v) => setImagesAutoSetActive(v === true)}
                  />
                  <Label htmlFor="product-images-auto-set" className="text-xs text-gray-300 cursor-pointer">
                    Set active automatically
                  </Label>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => (imagesProduct ? loadProductImages(imagesProduct) : null)}
                  disabled={!headers || imagesLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-2 ${imagesLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-gray-300">Base prompt (editable)</Label>
                <Textarea
                  value={imagesBasePrompt}
                  onChange={(e) => setImagesBasePrompt(e.target.value)}
                  rows={4}
                  className="bg-slate-900 border-slate-800 text-white text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-300">Negative prompt</Label>
                <Textarea
                  value={imagesNegativePrompt}
                  onChange={(e) => setImagesNegativePrompt(e.target.value)}
                  rows={4}
                  className="bg-slate-900 border-slate-800 text-white text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Button size="sm" onClick={saveProductImageSettings} disabled={!headers || imagesLoading}>
                Save prompt
              </Button>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-400">Preset</Label>
                  <select
                    className="h-9 rounded-md bg-slate-900 border border-slate-800 text-white text-xs px-2"
                    value={imagesPreset}
                    onChange={(e) => setImagesPreset(e.target.value)}
                  >
                    <option value="auto">Auto</option>
                    <option value="gold">Gold</option>
                    <option value="jewelry">Jewelry</option>
                    <option value="produce">Produce</option>
                    <option value="generic">Generic</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-400">Count</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={String(imagesCount)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isFinite(n)) return;
                      setImagesCount(Math.max(1, Math.min(12, n)));
                    }}
                    className="h-9 w-20 bg-slate-900 border-slate-800 text-white text-xs"
                  />
                </div>

                <Button size="sm" variant="secondary" onClick={generateImageSet} disabled={!headers || imagesLoading}>
                  <Wand2 className="h-3.5 w-3.5 mr-2" />
                  Generate set
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generateMissingSlotImages}
                  disabled={!headers || imagesLoading || !(imagesPayload?.slots || []).some((s) => !s.active?.activeImageId)}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-2" />
                  Generate missing
                </Button>
              </div>
            </div>

            {imagesLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Working...
              </div>
            )}

            {!imagesLoading && !imagesPayload ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-gray-300">
                No image data loaded yet. Click “Refresh” (and verify the tenant filter).
              </div>
            ) : null}

            {!imagesLoading && imagesPayload && !(imagesPayload.slots?.length > 0) ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-gray-300">
                No image slots yet. Click “Generate set” to create multiple angles, then set the best one as active/primary.
              </div>
            ) : null}

            {imagesPayload?.slots?.length ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold text-white">Gallery</div>
                    <div className="text-[11px] text-gray-400">Jump to a slot (Primary is used on storefront).</div>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {imagesPayload.slots.length} slots · {imagesAutoSetActive ? "auto-set active on" : "auto-set active off"}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {[...imagesPayload.slots]
                    .sort((a, b) => Number(a.position) - Number(b.position))
                    .map((slot, idx) => {
                      const activeUrlRaw = slot.active?.url ? String(slot.active.url) : "";
                      const activeUrl = activeUrlRaw ? absolutizePublicUrl(activeUrlRaw) : null;
                      const placeholderUrl = imagesProduct
                        ? buildProductPlaceholder(imagesProduct.product, String(slot.label || slot.role || "Image"), idx, null)
                        : null;
                      const isPrimary =
                        slot.assetKey === imagesPayload.primaryAssetKey || slot.role === "primary" || Number(slot.position) === 0;
                      const label = String(slot.label || slot.role || "Image");

                      return (
                        <button
                          key={`gallery-${slot.id}`}
                          type="button"
                          className={`group relative overflow-hidden rounded-lg border bg-black/30 text-left transition-colors ${
                            isPrimary ? "border-amber-500/40" : "border-slate-800 hover:border-slate-700"
                          }`}
                          onClick={() => {
                            const el = document.getElementById(`slot-card-${slot.id}`);
                            el?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                          title={label}
                        >
                          <div className="aspect-square bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950">
                            {activeUrl || placeholderUrl ? (
                              <img
                                src={activeUrl || placeholderUrl || ""}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  if (!placeholderUrl) return;
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = placeholderUrl;
                                }}
                              />
                            ) : null}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[11px] text-white truncate">{label}</div>
                              {isPrimary ? (
                                <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-200">
                                  Primary
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : null}

            {imagesPayload?.slots?.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[...imagesPayload.slots]
                  .sort((a, b) => Number(a.position) - Number(b.position))
                  .map((slot, idx, slots) => {
                    const activeUrlRaw = slot.active?.url ? String(slot.active.url) : "";
                    const activeUrl = activeUrlRaw ? absolutizePublicUrl(activeUrlRaw) : null;
                    const slotPlaceholderUrl = imagesProduct
                      ? buildProductPlaceholder(imagesProduct.product, String(slot.label || slot.role || "Image"), idx, null)
                      : null;
                    const isPrimary =
                      slot.assetKey === imagesPayload.primaryAssetKey || slot.role === "primary" || Number(slot.position) === 0;
                    const isBusy = busySlotId === slot.id;
                    const historyKey = String(slot.assetKey);
                    const history = slotHistories[historyKey] || [];
                    const historyBusy = slotHistoryLoading[historyKey] || false;
                    const overrides =
                      slotOverridesById[slot.id] || ({
                        label: String(slot.label || ""),
                        angle: typeof (slot.metadata as any)?.angle === "string" ? String((slot.metadata as any).angle) : "",
                        promptOverride:
                          typeof (slot.metadata as any)?.promptOverride === "string" ? String((slot.metadata as any).promptOverride) : "",
                        negativePromptOverride:
                          typeof (slot.metadata as any)?.negativePromptOverride === "string"
                            ? String((slot.metadata as any).negativePromptOverride)
                            : "",
                      } as SlotPromptOverrides);
                    const prevIsPrimary =
                      idx > 0 &&
                      (slots[idx - 1].assetKey === imagesPayload.primaryAssetKey ||
                        slots[idx - 1].role === "primary" ||
                        Number(slots[idx - 1].position) === 0);

                    const moveUp = () => {
                      const ordered = slots.map((s) => String(s.id));
                      if (idx <= 0) return;
                      const next = [...ordered];
                      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                      reorderSlots(next);
                    };

                    const moveDown = () => {
                      const ordered = slots.map((s) => String(s.id));
                      if (idx >= ordered.length - 1) return;
                      const next = [...ordered];
                      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                      reorderSlots(next);
                    };

                    return (
                      <div
                        key={slot.id}
                        id={`slot-card-${slot.id}`}
                        className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm font-semibold text-white truncate">
                                {slot.label || slot.role || "Image"}
                              </div>
                              <Badge variant="outline" className="text-[10px] border-slate-700 text-gray-300">
                                {slot.role}
                              </Badge>
                              {isPrimary ? (
                                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-200">
                                  Primary
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate">products/{slot.assetKey}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={moveUp}
                              disabled={!headers || imagesLoading || isPrimary || prevIsPrimary || idx === 0}
                              title="Move up"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={moveDown}
                              disabled={!headers || imagesLoading || isPrimary || idx === slots.length - 1}
                              title="Move down"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            {!isPrimary ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteSlot(slot.id)}
                                disabled={!headers || imagesLoading || busySlotId === slot.id}
                                title="Delete slot"
                              >
                                <Trash2 className="h-4 w-4 text-rose-300" />
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        {activeUrl || slotPlaceholderUrl ? (
                          <img
                            src={activeUrl || slotPlaceholderUrl || ""}
                            alt=""
                            className="w-full h-44 object-cover rounded border border-slate-800"
                            onError={(e) => {
                              if (!slotPlaceholderUrl) return;
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = slotPlaceholderUrl;
                            }}
                          />
                        ) : (
                          <div className="w-full h-44 rounded border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
                        )}

                        <div className="flex items-center gap-2 flex-wrap">
                          <Button size="sm" onClick={() => generateSlotImage(slot)} disabled={!headers || imagesLoading || isBusy}>
                            {isBusy ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : null}
                            Generate
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => slotFileRefs.current[slot.id]?.click()}
                            disabled={!token || imagesLoading || isBusy}
                          >
                            <Upload className="h-3.5 w-3.5 mr-2" />
                            Upload
                          </Button>
                          <input
                            ref={(el) => {
                              slotFileRefs.current[slot.id] = el;
                            }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.currentTarget.files?.[0] || null;
                              e.currentTarget.value = "";
                              void uploadSlotImage(slot, file);
                            }}
                          />
                        </div>

                        <details className="rounded-lg border border-slate-800 bg-black/20 p-2">
                          <summary className="cursor-pointer text-xs text-gray-300 select-none">
                            Prompt overrides {overrides.promptOverride || overrides.negativePromptOverride ? "(custom)" : "(default)"}
                          </summary>
                          <div className="mt-3 space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-400">Label</Label>
                                <Input
                                  value={overrides.label}
                                  onChange={(e) =>
                                    setSlotOverridesById((prev) => ({
                                      ...prev,
                                      [slot.id]: { ...(prev[slot.id] || overrides), label: e.target.value },
                                    }))
                                  }
                                  className="h-9 bg-slate-900 border-slate-800 text-white text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-400">Angle (optional)</Label>
                                <Input
                                  value={overrides.angle}
                                  onChange={(e) =>
                                    setSlotOverridesById((prev) => ({
                                      ...prev,
                                      [slot.id]: { ...(prev[slot.id] || overrides), angle: e.target.value },
                                    }))
                                  }
                                  className="h-9 bg-slate-900 border-slate-800 text-white text-xs"
                                  placeholder="e.g. 3/4 front, top-down, side profile..."
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-400">Prompt override</Label>
                                <Textarea
                                  value={overrides.promptOverride}
                                  onChange={(e) =>
                                    setSlotOverridesById((prev) => ({
                                      ...prev,
                                      [slot.id]: { ...(prev[slot.id] || overrides), promptOverride: e.target.value },
                                    }))
                                  }
                                  rows={5}
                                  className="bg-slate-900 border-slate-800 text-white text-xs"
                                  placeholder="Leave empty to use base prompt"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-gray-400">Negative override</Label>
                                <Textarea
                                  value={overrides.negativePromptOverride}
                                  onChange={(e) =>
                                    setSlotOverridesById((prev) => ({
                                      ...prev,
                                      [slot.id]: { ...(prev[slot.id] || overrides), negativePromptOverride: e.target.value },
                                    }))
                                  }
                                  rows={5}
                                  className="bg-slate-900 border-slate-800 text-white text-xs"
                                  placeholder="Leave empty to use base negative prompt"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => suggestPromptForSlot(slot)}
                                disabled={!headers || imagesLoading || busySlotId === slot.id}
                              >
                                <Wand2 className="h-3.5 w-3.5 mr-2" />
                                Suggest
                              </Button>
                              <Button size="sm" onClick={() => saveSlotOverrides(slot)} disabled={!headers || imagesLoading || busySlotId === slot.id}>
                                {busySlotId === slot.id ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : null}
                                Save overrides
                              </Button>
                            </div>
                          </div>
                        </details>

                        <div className="rounded-lg border border-slate-800 bg-black/20 p-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-gray-300">History</div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => refreshSlotHistory(slot.assetKey)}
                              disabled={!headers || historyBusy}
                            >
                              Refresh
                            </Button>
                          </div>

                          {historyBusy ? (
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Loading...
                            </div>
                          ) : history.length === 0 ? (
                            <div className="text-xs text-gray-500">No history yet.</div>
                          ) : (
                            <div className="space-y-2 max-h-52 overflow-auto pr-1">
                              {history.map((img) => {
                                const previewUrl = img.storedUrl ? absolutizePublicUrl(String(img.storedUrl)) : null;
                                const isActive = slot.active?.activeImageId === img.id;
                                const itemBusy = busySlotId === img.id;

                                return (
                                  <div key={img.id} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {previewUrl ? (
                                        <button
                                          type="button"
                                          onClick={() => window.open(previewUrl, "_blank")}
                                          className="shrink-0 rounded border border-slate-800 overflow-hidden"
                                          aria-label="Open image"
                                        >
                                          <img src={previewUrl} alt="" className="w-10 h-10 object-cover" />
                                        </button>
                                      ) : (
                                        <div className="shrink-0 w-10 h-10 rounded border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
                                      )}
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <div className="text-xs text-gray-200 truncate">{img.model || "image"}</div>
                                          {isActive ? (
                                            <Badge variant="outline" className="text-[10px] text-amber-200 border-amber-500/40">
                                              Active
                                            </Badge>
                                          ) : null}
                                        </div>
                                        <div className="text-[11px] text-gray-500 truncate">
                                          {img.status || "unknown"}
                                          {img.error ? ` - ${img.error}` : null}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => openPromptEditorForImage(slot, img)}
                                        disabled={!headers || itemBusy}
                                      >
                                        Prompt
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setPrimaryFromImage(img.id)}
                                        disabled={!headers || itemBusy}
                                      >
                                        Primary
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => setActiveForSlot(slot.assetKey, img.id)}
                                        disabled={!headers || isActive || itemBusy}
                                      >
                                        Set active
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-sm text-gray-400">No image slots found.</div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeImages}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={promptEditorOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPromptEditorOpen(false);
            setPromptEditor(null);
            setPromptEditorBusy(false);
          }
        }}
      >
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit image prompt</DialogTitle>
            <DialogDescription className="text-gray-400">
              {promptEditor ? `Slot: ${promptEditor.slotLabel} · Model: ${promptEditor.model}` : "Edit prompt and regenerate."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {promptEditor ? (
              <div className="text-xs text-gray-500">
                Image: <span className="text-gray-300">{promptEditor.imageId}</span> · AssetKey:{" "}
                <span className="text-gray-300">products/{promptEditor.assetKey}</span>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-gray-300">Prompt</Label>
                <Textarea
                  value={promptEditor?.prompt || ""}
                  onChange={(e) => setPromptEditor((prev) => (prev ? { ...prev, prompt: e.target.value } : prev))}
                  rows={10}
                  className="bg-slate-900 border-slate-800 text-white text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-300">Negative prompt</Label>
                <Textarea
                  value={promptEditor?.negativePrompt || ""}
                  onChange={(e) => setPromptEditor((prev) => (prev ? { ...prev, negativePrompt: e.target.value } : prev))}
                  rows={10}
                  className="bg-slate-900 border-slate-800 text-white text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 flex items-center justify-between gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                setPromptEditorOpen(false);
                setPromptEditor(null);
                setPromptEditorBusy(false);
              }}
              disabled={promptEditorBusy}
            >
              Close
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={savePromptAsSlotDefault} disabled={!headers || !promptEditor || promptEditorBusy}>
                {promptEditorBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save as slot default
              </Button>
              <Button onClick={regenerateFromPromptEditor} disabled={!headers || !promptEditor || promptEditorBusy}>
                {promptEditorBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Regenerate
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={backfillOpen} onOpenChange={setBackfillOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle>Image backfill results</DialogTitle>
            <DialogDescription className="text-gray-400">
              Scans products and generates missing primary images (rule-based, no vision).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-gray-200">
            <div>Tenant: <span className="text-white">{backfillResult?.tenantKey || "current"}</span></div>
            {backfillResult?.categorySlug ? (
              <div>Category: <span className="text-white">{backfillResult.categorySlug}</span></div>
            ) : null}
            {typeof backfillResult?.onlyMissing === "boolean" ? (
              <div>Mode: <span className="text-white">{backfillResult.onlyMissing ? "missing only" : "missing + mismatched"}</span></div>
            ) : null}
            <div>Scanned: <span className="text-white">{backfillResult?.scanned ?? "-"}</span></div>
            <div>Missing: <span className="text-white">{backfillResult?.missing ?? "-"}</span></div>
            <div>Mismatched: <span className="text-white">{backfillResult?.mismatched ?? "-"}</span></div>
            <div>Regenerated: <span className="text-white">{backfillResult?.regenerated ?? "-"}</span></div>
            {backfillResult?.failed ? (
              <div className="text-amber-300">Failed: {backfillResult.failed}</div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBackfillOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
