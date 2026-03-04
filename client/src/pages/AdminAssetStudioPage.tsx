import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/lib/session";
import { apiRequest } from "@/lib/queryClient";
import { absolutizePublicUrl, withCacheBust } from "@/lib/assets";
import { VirtualList } from "@/components/VirtualList";
import { History, Loader2, Upload, Wand2 } from "lucide-react";

type RegistryItem = {
  id: string; // asset id
  namespace: string;
  key: string;
  variant: string;
  type: string;
  usage: string;
  tags: string[];
  defaultPrompt?: string;
  negativePrompt?: string;
  modelTier?: "quality" | "fast";
  asset?: any;
  active?: any;
  metadata?: Record<string, any>;
};

type AssetRow = {
  id: string;
  namespace: string;
  assetKey: string;
  variant: string;
  label?: string | null;
  metadata?: Record<string, any> | null;
  active?: { id: string; storedUrl?: string | null; updatedAt?: string | null } | null;
  updatedAt?: string | null;
};

type AssetVersion = {
  id: string;
  storedUrl?: string | null;
  status?: string | null;
  createdAt?: string | null;
  model?: string | null;
};

type SelectedAsset = {
  assetId: string;
  namespace: string;
  assetKey: string;
  variant: string;
  title: string;
  usage?: string;
  defaultPrompt?: string;
  negativePrompt?: string;
  modelTier?: "quality" | "fast";
  activeVersionId?: string | null;
};

type CategoryGroup = {
  categoryId: number;
  name: string;
  slug: string | null;
  cover?: RegistryItem | null;
  icon?: RegistryItem | null;
};

const TAB_KEYS = ["presets", "categories", "website", "library"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const LIBRARY_LIMIT = 80;

function parseSearchParams(location: string) {
  const idx = location.indexOf("?");
  const qs = idx >= 0 ? location.slice(idx + 1) : "";
  return new URLSearchParams(qs);
}

function previewUrlFromAsset(asset: { active?: { storedUrl?: string | null; updatedAt?: string | null } | null; updatedAt?: string | null }) {
  const storedUrl = asset?.active?.storedUrl || null;
  if (!storedUrl) return null;
  const updatedAt = asset.updatedAt || asset?.active?.updatedAt || null;
  return withCacheBust(absolutizePublicUrl(storedUrl), updatedAt);
}

export default function AdminAssetStudioPage() {
  const { token } = useSession();
  const [location] = useLocation();

  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : undefined),
    [token]
  );

  const params = useMemo(() => parseSearchParams(location), [location]);
  const tabParam = (params.get("tab") as TabKey | null) || (params.get("scope") === "landing" ? "presets" : "library");
  const initialTab: TabKey = TAB_KEYS.includes(tabParam as any) ? (tabParam as any) : "library";

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [namespace, setNamespace] = useState<string>(params.get("namespace") || "bourse");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [presets, setPresets] = useState<RegistryItem[]>([]);
  const [websiteAssets, setWebsiteAssets] = useState<RegistryItem[]>([]);
  const [categoryItems, setCategoryItems] = useState<RegistryItem[]>([]);
  const [libraryAssets, setLibraryAssets] = useState<AssetRow[]>([]);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryHasNext, setLibraryHasNext] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedAsset | null>(null);

  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versions, setVersions] = useState<AssetVersion[]>([]);

  const [generatePrompt, setGeneratePrompt] = useState("");
  const [generateNegativePrompt, setGenerateNegativePrompt] = useState("");
  const [generateMode, setGenerateMode] = useState<"quality" | "fast">("quality");
  const [generating, setGenerating] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [createKey, setCreateKey] = useState("");
  const [createVariant, setCreateVariant] = useState("default");
  const [createLabel, setCreateLabel] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = async (opts?: { libraryPage?: number }) => {
    if (!headers) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "library") {
        const page = opts?.libraryPage ?? libraryPage;
        const qs = new URLSearchParams();
        if (namespace !== "all") qs.set("namespace", namespace);
        if (search) qs.set("q", search);
        qs.set("page", String(page));
        qs.set("limit", String(LIBRARY_LIMIT));
        const res = await apiRequest(`/api/admin/assets?${qs.toString()}`, { headers });
        const items = (res?.assets || res?.items || []) as AssetRow[];
        setLibraryAssets(items);
        setLibraryHasNext(items.length === LIBRARY_LIMIT);
        return;
      }

      const qs = new URLSearchParams();
      qs.set("namespace", namespace);
      qs.set("tag", tab === "presets" ? "landing" : tab === "categories" ? "category" : tab);
      if (search) qs.set("q", search);
      if (tab === "categories") qs.set("include", "categories");
      const res = await apiRequest(`/api/admin/assets/registry?${qs.toString()}`, { headers });
      const items = (res?.items || []) as RegistryItem[];
      if (tab === "presets") setPresets(items);
      if (tab === "website") setWebsiteAssets(items);
      if (tab === "categories") setCategoryItems(items);
    } catch (err: any) {
      setError(err?.message || "Failed to load assets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!headers) return;
    if (tab !== "library" && namespace === "all") return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers?.Authorization, tab, namespace]);

  useEffect(() => {
    if (!headers) return;
    const handle = setTimeout(() => {
      if (tab !== "library" && namespace === "all") return;
      refresh();
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, headers?.Authorization, tab, namespace]);

  useEffect(() => {
    if (!historyOpen || !headers || !selected) return;
    setVersions([]);
    setVersionsLoading(true);
    apiRequest(`/api/admin/assets/${encodeURIComponent(selected.assetId)}/versions?limit=25`, { headers })
      .then((res) => setVersions((res?.items || []) as AssetVersion[]))
      .catch((err: any) => setError(err?.message || "Failed to load history"))
      .finally(() => setVersionsLoading(false));
  }, [historyOpen, headers, selected]);

  const openHistory = (asset: SelectedAsset) => {
    setSelected(asset);
    setHistoryOpen(true);
  };

  const openGenerate = (asset: SelectedAsset) => {
    setSelected(asset);
    setGeneratePrompt(asset.defaultPrompt || "");
    setGenerateNegativePrompt(asset.negativePrompt || "");
    setGenerateMode(asset.modelTier || "quality");
    setGenerateOpen(true);
  };

  const openUpload = (asset: SelectedAsset) => {
    setSelected(asset);
    setUploadFile(null);
    setUploadOpen(true);
  };

  const openCreate = () => {
    setCreateKey("");
    setCreateVariant("default");
    setCreateLabel("");
    setCreateDescription("");
    setCreateOpen(true);
  };

  const handleCreateAsset = async () => {
    if (!headers) return;
    if (namespace === "all") return;
    const assetKey = createKey.trim();
    if (!assetKey) return;

    setCreating(true);
    setError(null);
    try {
      await apiRequest("/api/admin/assets/images/update-metadata", {
        method: "POST",
        headers,
        body: JSON.stringify({
          namespace,
          assetKey,
          variant: createVariant.trim() || "default",
          label: createLabel.trim() || undefined,
          description: createDescription.trim() || undefined,
        }),
      });
      setCreateOpen(false);
      setLibraryPage(1);
      await refresh({ libraryPage: 1 });
    } catch (err: any) {
      setError(err?.message || "Create asset failed");
    } finally {
      setCreating(false);
    }
  };

  const handleSetActive = async (versionId: string) => {
    if (!headers || !selected) return;
    setError(null);
    try {
      await apiRequest(`/api/admin/assets/${encodeURIComponent(selected.assetId)}/set-active`, {
        method: "POST",
        headers,
        body: JSON.stringify({ versionId }),
      });
      setHistoryOpen(false);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to set active");
    }
  };

  const handleGenerate = async () => {
    if (!headers || !selected) return;
    const prompt = generatePrompt.trim();
    if (!prompt) return;

    setGenerating(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/assets/${encodeURIComponent(selected.assetId)}/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          negativePrompt: generateNegativePrompt.trim() || undefined,
          mode: generateMode,
          setActive: true,
        }),
      });
      setGenerateOpen(false);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Generate failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleUpload = async () => {
    if (!selected || !uploadFile) return;
    if (!token) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("setActive", "true");

      const resp = await fetch(`/api/admin/assets/${encodeURIComponent(selected.assetId)}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || "Upload failed");
      }

      setUploadOpen(false);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const runBulkGenerate = async (opts: { tag: string; include?: string; type?: string; missingOnly: boolean }) => {
    if (!headers) return;
    if (namespace === "all") return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest("/api/admin/assets/bulk-generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          namespace,
          tag: opts.tag,
          include: opts.include,
          type: opts.type,
          missingOnly: opts.missingOnly,
          limit: 30,
          setActive: true,
        }),
      });
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Bulk generate failed");
    } finally {
      setLoading(false);
    }
  };

  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const byId = new Map<number, CategoryGroup>();

    for (const item of categoryItems) {
      const categoryId = Number(item?.metadata?.categoryId);
      if (!Number.isFinite(categoryId)) continue;

      const existing =
        byId.get(categoryId) ||
        ({
          categoryId,
          name: String(item?.metadata?.categoryName || `Category ${categoryId}`),
          slug: item?.metadata?.categorySlug ? String(item.metadata.categorySlug) : null,
          cover: null,
          icon: null,
        } satisfies CategoryGroup);

      existing.name = String(item?.metadata?.categoryName || existing.name || `Category ${categoryId}`);
      existing.slug = item?.metadata?.categorySlug ? String(item.metadata.categorySlug) : existing.slug;

      const slot = String(item?.metadata?.slot || "");
      if (slot === "cover") existing.cover = item;
      else if (slot === "icon") existing.icon = item;
      else if (String(item.key || "").endsWith("/icon")) existing.icon = item;
      else existing.cover = item;

      byId.set(categoryId, existing);
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryItems]);

  const renderCategoryRow = (group: CategoryGroup) => {
    const cover = group.cover || null;
    const icon = group.icon || null;

    const coverAssetView = cover ? (cover.asset ? { ...cover.asset, active: cover.active } : { active: cover.active, updatedAt: null }) : null;
    const iconAssetView = icon ? (icon.asset ? { ...icon.asset, active: icon.active } : { active: icon.active, updatedAt: null }) : null;
    const coverUrl = coverAssetView ? previewUrlFromAsset(coverAssetView as any) : null;
    const iconUrl = iconAssetView ? previewUrlFromAsset(iconAssetView as any) : null;

    const coverSelected: SelectedAsset | null = cover
      ? {
          assetId: cover.id,
          namespace: cover.namespace,
          assetKey: cover.key,
          variant: cover.variant || "default",
          title: `${cover.namespace}/${cover.key}`,
          usage: cover.usage,
          defaultPrompt: cover.defaultPrompt,
          negativePrompt: cover.negativePrompt,
          modelTier: cover.modelTier,
          activeVersionId: cover?.active?.id || null,
        }
      : null;

    const iconSelected: SelectedAsset | null = icon
      ? {
          assetId: icon.id,
          namespace: icon.namespace,
          assetKey: icon.key,
          variant: icon.variant || "default",
          title: `${icon.namespace}/${icon.key}`,
          usage: icon.usage,
          defaultPrompt: icon.defaultPrompt,
          negativePrompt: icon.negativePrompt,
          modelTier: icon.modelTier,
          activeVersionId: icon?.active?.id || null,
        }
      : null;

    return (
      <div className="h-full flex items-center gap-3 px-3">
        <div className="min-w-0 w-56">
          <div className="text-sm font-semibold text-white truncate">{group.name}</div>
          <div className="text-xs text-gray-500 truncate">{group.slug ? `/${group.slug}` : `Category ${group.categoryId}`}</div>
        </div>

        <div className="flex items-center gap-6 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-28">
              {coverUrl ? (
                <img src={coverUrl} alt="" className="h-16 w-28 object-cover rounded border border-slate-800" loading="lazy" />
              ) : (
                <div className="h-16 w-28 rounded border border-dashed border-slate-800 bg-slate-950/40" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" onClick={() => coverSelected && openHistory(coverSelected)} disabled={!coverSelected} aria-label="Cover history">
                <History className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="secondary" onClick={() => coverSelected && openUpload(coverSelected)} disabled={!coverSelected} aria-label="Upload cover">
                <Upload className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                onClick={() => coverSelected && openGenerate(coverSelected)}
                disabled={!coverSelected || !cover?.defaultPrompt}
                aria-label="Generate cover"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-16">
              {iconUrl ? (
                <img src={iconUrl} alt="" className="h-14 w-14 object-contain rounded border border-slate-800 bg-slate-950/40" loading="lazy" />
              ) : (
                <div className="h-14 w-14 rounded border border-dashed border-slate-800 bg-slate-950/40" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" onClick={() => iconSelected && openHistory(iconSelected)} disabled={!iconSelected} aria-label="Icon history">
                <History className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="secondary" onClick={() => iconSelected && openUpload(iconSelected)} disabled={!iconSelected} aria-label="Upload icon">
                <Upload className="h-4 w-4" />
              </Button>
              <Button size="icon" onClick={() => iconSelected && openGenerate(iconSelected)} disabled={!iconSelected || !icon?.defaultPrompt} aria-label="Generate icon">
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRegistryRow = (item: RegistryItem) => {
    const assetView = item.asset ? { ...item.asset, active: item.active } : { active: item.active, updatedAt: null };
    const previewUrl = previewUrlFromAsset(assetView as any);

    const selectedAsset: SelectedAsset = {
      assetId: item.id,
      namespace: item.namespace,
      assetKey: item.key,
      variant: item.variant || "default",
      title: `${item.namespace}/${item.key}`,
      usage: item.usage,
      defaultPrompt: item.defaultPrompt,
      negativePrompt: item.negativePrompt,
      modelTier: item.modelTier,
      activeVersionId: item?.active?.id || null,
    };

    return (
      <div className="h-full flex items-center gap-3 px-3">
        <div className="w-24">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-16 w-24 object-cover rounded border border-slate-800" loading="lazy" />
          ) : (
            <div className="h-16 w-24 rounded border border-dashed border-slate-800 bg-slate-950/40" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{item.key}</div>
            <Badge variant="outline" className="text-[10px] bg-slate-950 border-slate-800 text-gray-400">
              {item.namespace}
            </Badge>
            {item.type ? (
              <Badge variant="outline" className="text-[10px] bg-slate-950 border-slate-800 text-gray-400">
                {item.type}
              </Badge>
            ) : null}
          </div>
          <div className="text-xs text-gray-500 truncate">{item.usage}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => openHistory(selectedAsset)}>
            <History className="h-4 w-4 mr-2" />
            History
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openUpload(selectedAsset)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
          <Button size="sm" onClick={() => openGenerate(selectedAsset)} disabled={!item.defaultPrompt}>
            <Wand2 className="h-4 w-4 mr-2" />
            Generate
          </Button>
        </div>
      </div>
    );
  };

  const renderLibraryRow = (asset: AssetRow) => {
    const previewUrl = previewUrlFromAsset(asset as any);
    const description = String(asset?.metadata?.description || "");

    const selectedAsset: SelectedAsset = {
      assetId: asset.id,
      namespace: asset.namespace,
      assetKey: asset.assetKey,
      variant: asset.variant || "default",
      title: `${asset.namespace}/${asset.assetKey}`,
      usage: description || undefined,
      activeVersionId: asset?.active?.id || null,
    };

    return (
      <div className="h-full flex items-center gap-3 px-3">
        <div className="w-24">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-16 w-24 object-cover rounded border border-slate-800" loading="lazy" />
          ) : (
            <div className="h-16 w-24 rounded border border-dashed border-slate-800 bg-slate-950/40" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{asset.assetKey}</div>
            <Badge variant="outline" className="text-[10px] bg-slate-950 border-slate-800 text-gray-400">
              {asset.namespace}
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-slate-950 border-slate-800 text-gray-400">
              {asset.variant || "default"}
            </Badge>
          </div>
          <div className="text-xs text-gray-500 truncate">{description || asset.label || ""}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => openHistory(selectedAsset)}>
            <History className="h-4 w-4 mr-2" />
            History
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openUpload(selectedAsset)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
          <Button size="sm" onClick={() => openGenerate(selectedAsset)}>
            <Wand2 className="h-4 w-4 mr-2" />
            Generate
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Asset Studio</h1>
          <p className="text-sm text-gray-400">Unified images + icons management.</p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : null}
      </div>

      {error ? <div className="text-sm text-red-300">{error}</div> : null}

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = v as TabKey;
          setTab(next);
          if (next === "library") setLibraryPage(1);
          if (next !== "library" && namespace === "all") setNamespace("bourse");
        }}
      >
        <TabsList className="bg-slate-900 border border-slate-800">
          <TabsTrigger value="presets">Presets</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="website">Website</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
        </TabsList>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="bg-slate-900 border-slate-800 h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Namespace</Label>
                <Select
                  value={namespace}
                  onValueChange={(value) => {
                    setNamespace(value);
                    if (tab === "library" || value === "all") setLibraryPage(1);
                    if (value === "all" && tab !== "library") setTab("library");
                  }}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800">
                    <SelectItem value="bourse">Bourse (bourse)</SelectItem>
                    <SelectItem value="exportunity">Exportunity (exportunity)</SelectItem>
                    <SelectItem value="products">Products (products)</SelectItem>
                    <SelectItem value="all">All namespaces</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Search</Label>
                <Input
                  value={search}
                  onChange={(e) => {
                    if (tab === "library") setLibraryPage(1);
                    setSearch(e.target.value);
                  }}
                  className="bg-slate-950 border-slate-800 text-white"
                  placeholder={tab === "library" ? "Search by key/label" : "Search registry keys"}
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800">
                <Button variant="outline" size="sm" onClick={() => refresh()} disabled={!headers || loading}>
                  Refresh
                </Button>
                {tab === "presets" && namespace !== "all" ? (
                  <Button size="sm" variant="secondary" onClick={() => runBulkGenerate({ tag: "landing", missingOnly: true })} disabled={!headers || loading}>
                    Generate missing
                  </Button>
                ) : null}
                {tab === "categories" && namespace !== "all" ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => runBulkGenerate({ tag: "category", include: "categories", missingOnly: true })}
                      disabled={!headers || loading}
                    >
                      Generate missing
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runBulkGenerate({ tag: "category", include: "categories", type: "icon", missingOnly: true })}
                      disabled={!headers || loading}
                    >
                      Icons only
                    </Button>
                  </>
                ) : null}
                {tab === "library" ? (
                  <Button size="sm" variant="secondary" onClick={openCreate} disabled={!headers || loading || namespace === "all"}>
                    New asset
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <TabsContent value="presets" className="m-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Landing presets</CardTitle>
              </CardHeader>
              <CardContent>
                <VirtualList
                  items={presets}
                  itemHeight={92}
                  className="h-[70vh] rounded border border-slate-800 bg-black/20"
                  getKey={(item) => item.id}
                  renderItem={(item) => renderRegistryRow(item)}
                />
              </CardContent>
            </TabsContent>

            <TabsContent value="categories" className="m-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <VirtualList
                  items={categoryGroups}
                  itemHeight={104}
                  className="h-[70vh] rounded border border-slate-800 bg-black/20"
                  getKey={(item) => String(item.categoryId)}
                  renderItem={(item) => renderCategoryRow(item)}
                />
              </CardContent>
            </TabsContent>

            <TabsContent value="website" className="m-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Website assets</CardTitle>
              </CardHeader>
              <CardContent>
                <VirtualList
                  items={websiteAssets}
                  itemHeight={92}
                  className="h-[70vh] rounded border border-slate-800 bg-black/20"
                  getKey={(item) => item.id}
                  renderItem={(item) => renderRegistryRow(item)}
                />
              </CardContent>
            </TabsContent>

            <TabsContent value="library" className="m-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Library</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <VirtualList
                  key={`library:${namespace}:${search}:${libraryPage}`}
                  items={libraryAssets}
                  itemHeight={92}
                  className="h-[70vh] rounded border border-slate-800 bg-black/20"
                  getKey={(item) => item.id}
                  renderItem={(item) => renderLibraryRow(item)}
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-500">Page {libraryPage}</div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!headers || loading || libraryPage <= 1}
                      onClick={async () => {
                        const next = Math.max(libraryPage - 1, 1);
                        setLibraryPage(next);
                        await refresh({ libraryPage: next });
                      }}
                    >
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!headers || loading || !libraryHasNext}
                      onClick={async () => {
                        const next = libraryPage + 1;
                        setLibraryPage(next);
                        await refresh({ libraryPage: next });
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </TabsContent>
          </Card>
        </div>
      </Tabs>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>History</DialogTitle>
            {selected ? <DialogDescription className="text-gray-400">{selected.title}</DialogDescription> : null}
          </DialogHeader>

          {selected ? (
            <div className="space-y-3">
              {selected.usage ? <div className="text-sm text-gray-400">{selected.usage}</div> : null}

              {versionsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading versions...
                </div>
              ) : versions.length ? (
                <div className="space-y-3">
                  {versions.map((version) => {
                    const url = version.storedUrl ? withCacheBust(absolutizePublicUrl(version.storedUrl), version.createdAt || null) : null;
                    const isActive = !!selected.activeVersionId && version.id === selected.activeVersionId;
                    return (
                      <div key={version.id} className="flex items-center gap-3 rounded border border-slate-800 bg-black/20 p-3">
                        <div className="w-24">
                          {url ? (
                            <img src={url} alt="" className="h-16 w-24 object-cover rounded border border-slate-800" loading="lazy" />
                          ) : (
                            <div className="h-16 w-24 rounded border border-dashed border-slate-800 bg-slate-950/40" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-sm font-semibold text-white truncate">{version.id}</div>
                            {isActive ? (
                              <Badge className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Active</Badge>
                            ) : null}
                            {version.status ? (
                              <Badge variant="outline" className="text-[10px] bg-slate-950 border-slate-800 text-gray-400">
                                {version.status}
                              </Badge>
                            ) : null}
                            {version.model ? (
                              <Badge variant="outline" className="text-[10px] bg-slate-950 border-slate-800 text-gray-400">
                                {version.model}
                              </Badge>
                            ) : null}
                          </div>
                          {version.createdAt ? <div className="text-xs text-gray-500">{new Date(version.createdAt).toLocaleString()}</div> : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {url ? (
                            <Button size="sm" variant="outline" asChild>
                              <a href={url} target="_blank" rel="noreferrer">
                                View
                              </a>
                            </Button>
                          ) : null}
                          <Button size="sm" onClick={() => handleSetActive(version.id)} disabled={isActive || version.status !== "succeeded"}>
                            Set active
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-gray-400">No versions yet.</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-400">Select an asset.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle>Generate</DialogTitle>
            {selected ? <DialogDescription className="text-gray-400">{selected.title}</DialogDescription> : null}
          </DialogHeader>

          {selected ? (
            <div className="space-y-3">
              {selected.usage ? <div className="text-sm text-gray-400">{selected.usage}</div> : null}

              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Prompt</Label>
                <Textarea
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white min-h-[140px]"
                  placeholder="Describe the image you want to generate..."
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Negative prompt (optional)</Label>
                <Textarea
                  value={generateNegativePrompt}
                  onChange={(e) => setGenerateNegativePrompt(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white min-h-[90px]"
                  placeholder="What should be excluded from the image?"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Mode</Label>
                <Select value={generateMode} onValueChange={(v) => setGenerateMode(v as any)}>
                  <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800">
                    <SelectItem value="quality">Quality</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={generating}>
                  Cancel
                </Button>
                <Button onClick={handleGenerate} disabled={generating || !generatePrompt.trim()}>
                  {generating ? "Generating..." : "Generate & set active"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="text-sm text-gray-400">Select an asset.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload</DialogTitle>
            {selected ? <DialogDescription className="text-gray-400">{selected.title}</DialogDescription> : null}
          </DialogHeader>

          {selected ? (
            <div className="space-y-3">
              {selected.usage ? <div className="text-sm text-gray-400">{selected.usage}</div> : null}

              <div className="space-y-1">
                <Label className="text-xs text-gray-400">File</Label>
                <Input
                  type="file"
                  accept="image/*"
                  className="bg-slate-950 border-slate-800 text-white"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
                <div className="text-xs text-gray-500">Uploads the file and sets it active for this key.</div>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
                  Cancel
                </Button>
                <Button onClick={handleUpload} disabled={uploading || !uploadFile}>
                  {uploading ? "Uploading..." : "Upload & set active"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="text-sm text-gray-400">Select an asset.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>New asset</DialogTitle>
            <DialogDescription className="text-gray-400">Creates (or updates) an asset key in the selected namespace.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Key</Label>
              <Input
                value={createKey}
                onChange={(e) => setCreateKey(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white"
                placeholder="e.g. landing/hero_desktop"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Variant</Label>
                <Input
                  value={createVariant}
                  onChange={(e) => setCreateVariant(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white"
                  placeholder="default"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Label (optional)</Label>
                <Input
                  value={createLabel}
                  onChange={(e) => setCreateLabel(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white"
                  placeholder="Human-friendly label"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Description (optional)</Label>
              <Textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white min-h-[100px]"
                placeholder="Where this asset is used, guidelines, etc."
              />
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreateAsset} disabled={creating || !createKey.trim() || namespace === "all"}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
