import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";

type MarkerStyle = {
  id: number;
  tenantId: number;
  key: string;
  label: string;
  iconType: "lucide" | "emoji" | "svg" | "image_url";
  iconValue: string;
  iconAssetId?: string | null;
  iconPrompt?: string | null;
  locked?: boolean | null;
  color: string;
  size: number;
  zIndex: number;
  isActive: boolean;
};

type NewMarkerStyleDraft = {
  key: string;
  label: string;
  iconType: MarkerStyle["iconType"];
  iconValue: string;
  iconPrompt: string;
  locked: boolean;
  color: string;
  size: number;
  zIndex: number;
  isActive: boolean;
};

type Category = {
  id: number;
  name: string;
  slug: string;
  color?: string | null;
  icon?: string | null;
  mapMarkerKey?: string | null;
};

type MapIconsResponse = {
  ok: boolean;
  styles: MarkerStyle[];
  categories: Category[];
};

const ICON_PROMPT_PRESETS: Array<{ key: string; label: string; prompt: string }> = [
  {
    key: "minimal_pin",
    label: "Minimal pin",
    prompt: "Minimal modern map pin icon, flat vector style, bold silhouette, high contrast, transparent background, centered, 1:1",
  },
  {
    key: "premium_gold",
    label: "Premium gold",
    prompt: "Premium gold marketplace marker icon, elegant metallic gradient, clean edges, transparent background, icon-only, 1:1",
  },
  {
    key: "afrofuturistic",
    label: "Afrofuturistic",
    prompt: "Afrofuturistic trade map icon, geometric motif, modern African-inspired styling, vibrant but clean, transparent background, 1:1",
  },
  {
    key: "outlined",
    label: "Outlined",
    prompt: "Simple outlined location marker icon, monochrome, crisp stroke, transparent background, 1:1",
  },
];

function normalizeHexColor(value: string) {
  const next = String(value || "")
    .trim()
    .toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(next)) return next;
  return "#111827";
}

function normalizeCategoryStyleKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defaultCategoryStyleKey(category: Category) {
  const source = String(category.slug || category.name || category.id);
  const normalized = normalizeCategoryStyleKey(`cat_${source}`);
  return normalized || `cat_${category.id}`;
}

function defaultCategoryPrompt(category: Category) {
  const name = String(category.name || "Marketplace").trim();
  const slug = String(category.slug || "").trim();
  const descriptor = slug ? `${name} (${slug})` : name;
  return `Professional marketplace map icon for ${descriptor} category, minimal vector pictogram, high contrast, transparent background, centered, no text, 1:1`;
}

function MarkerPreview({ style }: { style: Partial<MarkerStyle> }) {
  const iconType = style.iconType || "emoji";
  const iconValue = String(style.iconValue || "🏪");
  const color = normalizeHexColor(String(style.color || "#111827"));
  const size = Math.max(14, Math.min(72, Number(style.size || 28)));

  const iconNode =
    iconType === "image_url" && iconValue ? (
      // eslint-disable-next-line jsx-a11y/alt-text
      <img src={iconValue} className="w-full h-full object-contain" />
    ) : iconType === "image_url" ? (
      <span className="text-[10px] text-white/80">IMG</span>
    ) : iconType === "svg" ? (
      <span
        className="inline-flex items-center justify-center"
        dangerouslySetInnerHTML={{ __html: iconValue }}
      />
    ) : (
      <span className="text-[18px] leading-none">{iconType === "lucide" ? "◉" : iconValue}</span>
    );

  return (
    <div
      className="inline-flex items-center justify-center rounded-full border border-white/15 shadow"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
      }}
    >
      {iconNode}
    </div>
  );
}

function EditableStyleCard({
  style,
  onSave,
  onDisable,
  onGenerateImage,
  generating,
}: {
  style: MarkerStyle;
  onSave: (style: MarkerStyle) => void;
  onDisable: (key: string) => void;
  onGenerateImage: (key: string, prompt: string) => void;
  generating: boolean;
}) {
  const [draft, setDraft] = useState<MarkerStyle>(style);
  const hasValidImageUrl =
    draft.iconType !== "image_url" ||
    /^https?:\/\//i.test(String(draft.iconValue || "").trim()) ||
    String(draft.iconValue || "").trim().startsWith("/");

  useEffect(() => {
    setDraft(style);
  }, [style]);

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MarkerPreview style={draft} />
            <div>
              <div className="text-sm text-white font-medium">{draft.label || draft.key}</div>
              <div className="text-[11px] text-gray-500">{draft.key}</div>
            </div>
          </div>
          <Badge
            className={
              draft.isActive
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "bg-slate-500/15 text-slate-300 border border-slate-500/30"
            }
          >
            {draft.isActive ? "active" : "inactive"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            value={draft.label}
            onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="Label"
            className="bg-gray-950 border-gray-700 text-white"
          />
          <Select
            value={draft.iconType}
            onValueChange={(value: any) =>
              setDraft((prev) => {
                const nextType = value as MarkerStyle["iconType"];
                if (nextType === "image_url") {
                  const raw = String(prev.iconValue || "").trim();
                  const keep = /^https?:\/\//i.test(raw) || raw.startsWith("/");
                  return { ...prev, iconType: nextType, iconValue: keep ? raw : "" };
                }
                return { ...prev, iconType: nextType };
              })
            }
          >
            <SelectTrigger className="bg-gray-950 border-gray-700 text-white">
              <SelectValue placeholder="Icon type" />
            </SelectTrigger>
            <SelectContent className="bg-gray-950 border-gray-700 text-white">
              <SelectItem value="emoji">emoji</SelectItem>
              <SelectItem value="lucide">lucide</SelectItem>
              <SelectItem value="svg">svg</SelectItem>
              <SelectItem value="image_url">image_url</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={draft.iconValue}
            onChange={(e) => setDraft((prev) => ({ ...prev, iconValue: e.target.value }))}
            placeholder={draft.iconType === "image_url" ? "Generated image URL" : "Icon value"}
            className="bg-gray-950 border-gray-700 text-white"
            readOnly={draft.iconType === "image_url"}
          />
        </div>

        {draft.iconType === "image_url" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-2">
              <div className="text-xs text-gray-300">Prompt</div>
              <Textarea
                value={String(draft.iconPrompt || "")}
                onChange={(e) => setDraft((prev) => ({ ...prev, iconPrompt: e.target.value }))}
                placeholder="Describe the icon style you want to generate..."
                className="min-h-[90px] bg-gray-950 border-gray-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-gray-300">Lock</div>
              <div className="flex items-center justify-between rounded-md border border-gray-700 px-3 bg-gray-950 h-10">
                <span className="text-xs text-gray-300">Locked</span>
                <Switch
                  checked={!!draft.locked}
                  onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, locked: checked }))}
                />
              </div>
              <Button
                type="button"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={generating || !!draft.locked || !String(draft.iconPrompt || "").trim()}
                onClick={() => onGenerateImage(draft.key, String(draft.iconPrompt || "").trim())}
              >
                Generate
              </Button>
              {draft.locked ? (
                <div className="text-[11px] text-amber-300/90">Unlock to regenerate.</div>
              ) : null}
              {!hasValidImageUrl ? (
                <div className="text-[11px] text-gray-400">Generate an image before saving.</div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input
            value={draft.color}
            onChange={(e) => setDraft((prev) => ({ ...prev, color: e.target.value }))}
            placeholder="#111827"
            className="bg-gray-950 border-gray-700 text-white"
          />
          <Input
            type="number"
            value={draft.size}
            onChange={(e) => setDraft((prev) => ({ ...prev, size: Number(e.target.value || 28) }))}
            className="bg-gray-950 border-gray-700 text-white"
          />
          <Input
            type="number"
            value={draft.zIndex}
            onChange={(e) => setDraft((prev) => ({ ...prev, zIndex: Number(e.target.value || 10) }))}
            className="bg-gray-950 border-gray-700 text-white"
          />
          <div className="flex items-center justify-between rounded-md border border-gray-700 px-3 bg-gray-950">
            <span className="text-xs text-gray-300">Active</span>
            <Switch checked={!!draft.isActive} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, isActive: checked }))} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => onSave(draft)}
            disabled={!hasValidImageUrl}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            Save
          </Button>
          {draft.key !== "shop_default" ? (
            <Button variant="outline" onClick={() => onDisable(draft.key)} className="border-red-700/50 text-red-300 hover:bg-red-900/25">
              Disable
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminMapIconsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const [newStyleMode, setNewStyleMode] = useState<"emoji" | "image">("emoji");
  const [newStyle, setNewStyle] = useState<NewMarkerStyleDraft>({
    key: "",
    label: "",
    iconType: "emoji",
    iconValue: "🧭",
    iconPrompt: "",
    locked: false,
    color: "#111827",
    size: 28,
    zIndex: 12,
    isActive: true,
  });
  const [newStylePreset, setNewStylePreset] = useState("custom");
  const [lastGeneratedPreviewUrl, setLastGeneratedPreviewUrl] = useState("");
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [generatingCategoryId, setGeneratingCategoryId] = useState<number | null>(null);
  const [categoryMappings, setCategoryMappings] = useState<Record<number, string>>({});
  const [categoryPrompts, setCategoryPrompts] = useState<Record<number, string>>({});
  const [categoryLocked, setCategoryLocked] = useState<Record<number, boolean>>({});

  const mapIconsQueryKey = ["/api/admin/marketplace/map-icons", tenant.key];
  const { data, isLoading } = useQuery<MapIconsResponse>({
    queryKey: mapIconsQueryKey,
    queryFn: () => apiRequest("/api/admin/marketplace/map-icons", { method: "GET" }),
  });

  const styles = useMemo(() => (Array.isArray(data?.styles) ? data.styles : []), [data?.styles]);
  const categories = useMemo(() => (Array.isArray(data?.categories) ? data.categories : []), [data?.categories]);
  const styleByKey = useMemo(() => new Map(styles.map((style) => [String(style.key), style])), [styles]);

  useEffect(() => {
    const next: Record<number, string> = {};
    for (const category of categories) {
      next[category.id] = String(category.mapMarkerKey || "shop_default");
    }
    setCategoryMappings(next);
  }, [categories]);

  useEffect(() => {
    setCategoryPrompts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const category of categories) {
        if (String(next[category.id] || "").trim()) continue;
        const mappedKey = String(category.mapMarkerKey || defaultCategoryStyleKey(category));
        const mappedStyle = styleByKey.get(mappedKey);
        next[category.id] = String(mappedStyle?.iconPrompt || "").trim() || defaultCategoryPrompt(category);
        changed = true;
      }
      return changed ? next : prev;
    });

    setCategoryLocked((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const category of categories) {
        if (typeof next[category.id] === "boolean") continue;
        const mappedKey = String(category.mapMarkerKey || defaultCategoryStyleKey(category));
        const mappedStyle = styleByKey.get(mappedKey);
        next[category.id] = Boolean(mappedStyle?.locked);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [categories, styleByKey]);

  const saveStyleMutation = useMutation({
    mutationFn: async (style: Partial<MarkerStyle>) => {
      const key = String(style.key || "").trim();
      if (!key) {
        return apiRequest("/api/admin/marketplace/map-icons", {
          method: "POST",
          body: JSON.stringify(style),
        });
      }
      return apiRequest(`/api/admin/marketplace/map-icons/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify(style),
      });
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Map icon style updated." });
      queryClient.invalidateQueries({ queryKey: mapIconsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/nearby"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/feed"] });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Failed to save map icon style.",
        variant: "destructive",
      });
    },
  });

  const generateImageMutation = useMutation({
    mutationFn: async ({ key, prompt }: { key: string; prompt: string }) => {
      return apiRequest(`/api/admin/marketplace/map-icons/${encodeURIComponent(key)}/generate-image`, {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
    },
    onSuccess: () => {
      toast({ title: "Generated", description: "Image icon generated." });
      queryClient.invalidateQueries({ queryKey: mapIconsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/nearby"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/feed"] });
    },
    onError: (err: any) => {
      toast({
        title: "Generation failed",
        description: err?.message || "Failed to generate image icon.",
        variant: "destructive",
      });
    },
    onSettled: () => setGeneratingKey(null),
  });

  const generateCategoryImageMutation = useMutation({
    mutationFn: async ({
      categoryId,
      prompt,
      locked,
    }: {
      categoryId: number;
      prompt: string;
      locked: boolean;
    }) => {
      return apiRequest(`/api/admin/marketplace/map-icons/categories/${categoryId}/generate-image`, {
        method: "POST",
        body: JSON.stringify({ prompt, locked }),
      });
    },
    onSuccess: (payload: any, variables) => {
      const styleKey = String(payload?.mapMarkerKey || payload?.style?.key || "").trim();
      if (styleKey) {
        setCategoryMappings((prev) => ({ ...prev, [variables.categoryId]: styleKey }));
      }
      toast({
        title: "Category icon generated",
        description: "The category marker was generated and mapped automatically.",
      });
      queryClient.invalidateQueries({ queryKey: mapIconsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/product-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/nearby"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/feed"] });
    },
    onError: (err: any) => {
      toast({
        title: "Generation failed",
        description: err?.message || "Failed to generate category icon.",
        variant: "destructive",
      });
    },
    onSettled: () => setGeneratingCategoryId(null),
  });

  const createStyleMutation = useMutation({
    mutationFn: async (style: any) => {
      return apiRequest("/api/admin/marketplace/map-icons", {
        method: "POST",
        body: JSON.stringify(style),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mapIconsQueryKey }),
  });

  const handleGenerateImage = (key: string, prompt: string) => {
    setGeneratingKey(key);
    generateImageMutation.mutate({ key, prompt });
  };

  const handleGenerateCategoryIcon = (category: Category) => {
    const prompt = String(categoryPrompts[category.id] || "").trim() || defaultCategoryPrompt(category);
    if (!prompt) {
      toast({ title: "Missing prompt", description: "Provide an icon prompt first.", variant: "destructive" });
      return;
    }
    setGeneratingCategoryId(category.id);
    generateCategoryImageMutation.mutate({
      categoryId: category.id,
      prompt,
      locked: Boolean(categoryLocked[category.id]),
    });
  };

  const applyPromptPreset = (presetKey: string) => {
    setNewStylePreset(presetKey);
    if (presetKey === "custom") return;
    const preset = ICON_PROMPT_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    setNewStyle((prev) => ({ ...prev, iconPrompt: preset.prompt }));
  };

  const handleCreateStyle = async () => {
    const key = String(newStyle.key || "").trim();
    if (!key) {
      toast({ title: "Missing key", description: "Provide a marker key first.", variant: "destructive" });
      return;
    }

    const label = String(newStyle.label || "").trim() || key;
    const base = {
      key,
      label,
      color: newStyle.color,
      size: newStyle.size,
      zIndex: newStyle.zIndex,
      isActive: !!newStyle.isActive,
    };

    if (newStyleMode === "emoji") {
      const iconValue = String(newStyle.iconValue || "").trim() || "🏪";
      try {
        await createStyleMutation.mutateAsync({ ...base, iconType: "emoji", iconValue });
        toast({ title: "Created", description: "Map icon style created." });
        setNewStyle({
          key: "",
          label: "",
          iconType: "emoji",
          iconValue: "🧭",
          iconPrompt: "",
          locked: false,
          color: "#111827",
          size: 28,
          zIndex: 12,
          isActive: true,
        });
        return;
      } catch (err: any) {
        toast({
          title: "Create failed",
          description: err?.message || "Failed to create map icon style.",
          variant: "destructive",
        });
        return;
      }
    }

    const prompt = String(newStyle.iconPrompt || "").trim();
    if (!prompt) {
      toast({ title: "Missing prompt", description: "Provide an image prompt first.", variant: "destructive" });
      return;
    }

    try {
      await createStyleMutation.mutateAsync({
        ...base,
        iconType: "emoji",
        iconValue: "🖼️",
        iconPrompt: prompt,
        locked: false,
      });
    } catch (err: any) {
      toast({
        title: "Create failed",
        description: err?.message || "Failed to create map icon style.",
        variant: "destructive",
      });
      return;
    }

    let generatedUrl = "";
    try {
      setGeneratingKey(key);
      const generated: any = await generateImageMutation.mutateAsync({ key, prompt });
      generatedUrl = String(generated?.style?.iconValue || generated?.image?.storedUrl || generated?.image?.publicUrl || "").trim();
      if (generatedUrl) setLastGeneratedPreviewUrl(generatedUrl);
    } catch {
      // generateImageMutation handles toast + invalidation.
      return;
    }

    if (newStyle.locked) {
      try {
        await apiRequest(`/api/admin/marketplace/map-icons/${encodeURIComponent(key)}`, {
          method: "PATCH",
          body: JSON.stringify({ locked: true }),
        });
      } catch {
        toast({ title: "Lock failed", description: "Image was generated, but locking failed.", variant: "destructive" });
      }
    }

    toast({ title: "Created", description: "Image icon style created." });
    setNewStyle({
      key: "",
      label: "",
      iconType: "image_url",
      iconValue: generatedUrl || "",
      iconPrompt: "",
      locked: false,
      color: "#111827",
      size: 28,
      zIndex: 12,
      isActive: true,
    });
    setNewStylePreset("custom");
    return;
  };

  const disableStyleMutation = useMutation({
    mutationFn: async (key: string) => {
      return apiRequest(`/api/admin/marketplace/map-icons/${encodeURIComponent(key)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Disabled", description: "Style disabled and fallback applied." });
      queryClient.invalidateQueries({ queryKey: mapIconsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/nearby"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/feed"] });
    },
    onError: (err: any) => {
      toast({
        title: "Disable failed",
        description: err?.message || "Failed to disable style.",
        variant: "destructive",
      });
    },
  });

  const applyMappingsMutation = useMutation({
    mutationFn: async () => {
      const mappings = Object.entries(categoryMappings).map(([categoryId, mapMarkerKey]) => ({
        categoryId: Number(categoryId),
        mapMarkerKey,
      }));
      return apiRequest("/api/admin/marketplace/map-icons/apply-categories", {
        method: "POST",
        body: JSON.stringify({ mappings }),
      });
    },
    onSuccess: () => {
      toast({ title: "Applied", description: "Category marker mappings saved." });
      queryClient.invalidateQueries({ queryKey: mapIconsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/product-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/nearby"] });
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/buyer/feed"] });
    },
    onError: (err: any) => {
      toast({
        title: "Apply failed",
        description: err?.message || "Failed to apply category mappings.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Admin &gt; Marketplace &gt; Map Icons</h1>
        <p className="text-sm text-gray-400">
          One-click AI icon generation per category. Each category gets its own marker style and map mapping automatically.
        </p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Category icon generator (AI)</CardTitle>
          <CardDescription className="text-gray-400">
            Click Generate on any category to create/update its dedicated icon style and map it instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {categories.map((category) => {
              const mappedKey = String(categoryMappings[category.id] || category.mapMarkerKey || defaultCategoryStyleKey(category));
              const mappedStyle =
                styleByKey.get(mappedKey) ||
                styleByKey.get(defaultCategoryStyleKey(category)) ||
                styleByKey.get("shop_default");
              const prompt = String(categoryPrompts[category.id] || defaultCategoryPrompt(category));
              const isGenerating = generateCategoryImageMutation.isPending && generatingCategoryId === category.id;
              const disabled = generateCategoryImageMutation.isPending && generatingCategoryId !== category.id;

              return (
                <div key={category.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <MarkerPreview
                        style={
                          mappedStyle || {
                            iconType: "emoji",
                            iconValue: "📍",
                            color: category.color || "#111827",
                            size: 28,
                          }
                        }
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{category.name}</div>
                        <div className="text-[11px] text-gray-500 truncate">{category.slug}</div>
                      </div>
                    </div>
                    <Badge className="bg-blue-500/10 text-blue-300 border border-blue-500/30">{mappedKey}</Badge>
                  </div>

                  <Textarea
                    value={prompt}
                    onChange={(e) => setCategoryPrompts((prev) => ({ ...prev, [category.id]: e.target.value }))}
                    className="min-h-[72px] bg-gray-900 border-gray-700 text-white"
                    placeholder="Icon prompt..."
                  />

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                      <span>Lock style</span>
                      <Switch
                        checked={Boolean(categoryLocked[category.id])}
                        onCheckedChange={(checked) => setCategoryLocked((prev) => ({ ...prev, [category.id]: checked }))}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleGenerateCategoryIcon(category)}
                      disabled={disabled || !String(prompt).trim()}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[128px]"
                    >
                      {isGenerating ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Advanced: create style</CardTitle>
          <CardDescription className="text-gray-400">
            Optional manual editor for custom styles. The recommended flow is category generation above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Input
              value={newStyle.key}
              onChange={(e) => setNewStyle((prev) => ({ ...prev, key: e.target.value }))}
              placeholder="key (e.g. groceries)"
              className="bg-gray-950 border-gray-700 text-white md:col-span-2"
            />
            <Input
              value={newStyle.label}
              onChange={(e) => setNewStyle((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="label"
              className="bg-gray-950 border-gray-700 text-white md:col-span-2"
            />
            <Select
              value={newStyleMode}
              onValueChange={(value: any) => {
                const mode = value as "emoji" | "image";
                setNewStyleMode(mode);
                setNewStylePreset("custom");
                setNewStyle((prev) => ({
                  ...prev,
                  iconType: mode === "image" ? "image_url" : "emoji",
                  iconValue: mode === "image" ? prev.iconValue : prev.iconValue || "🧭",
                }));
              }}
            >
              <SelectTrigger className="bg-gray-950 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-950 border-gray-700 text-white">
                <SelectItem value="emoji">emoji</SelectItem>
                <SelectItem value="image">image</SelectItem>
              </SelectContent>
            </Select>
            {newStyleMode === "emoji" ? (
              <Input
                value={newStyle.iconValue}
                onChange={(e) => setNewStyle((prev) => ({ ...prev, iconValue: e.target.value }))}
                placeholder="emoji (e.g. 🏪)"
                className="bg-gray-950 border-gray-700 text-white"
              />
            ) : (
              <div className="flex items-center rounded-md border border-gray-800 bg-gray-950 px-3 text-xs text-gray-400">
                Image generated below
              </div>
            )}
          </div>

          {newStyleMode === "image" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-gray-300">Prompt</div>
                  <Select value={newStylePreset} onValueChange={applyPromptPreset}>
                    <SelectTrigger className="h-8 w-[220px] bg-gray-950 border-gray-700 text-white text-xs">
                      <SelectValue placeholder="Prompt preset" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-950 border-gray-700 text-white">
                      <SelectItem value="custom">Custom prompt</SelectItem>
                      {ICON_PROMPT_PRESETS.map((preset) => (
                        <SelectItem key={preset.key} value={preset.key}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={String(newStyle.iconPrompt || "")}
                  onChange={(e) => setNewStyle((prev) => ({ ...prev, iconPrompt: e.target.value }))}
                  placeholder="Describe the icon style you want to generate..."
                  className="min-h-[90px] bg-gray-950 border-gray-700 text-white"
                />
                <div className="text-[11px] text-gray-400">
                  Uses the same image generation pipeline as product images (asset storage + CDN + prompt persistence).
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-gray-300">Lock</div>
                <div className="flex items-center justify-between rounded-md border border-gray-700 px-3 bg-gray-950 h-10">
                  <span className="text-xs text-gray-300">Locked</span>
                  <Switch
                    checked={!!newStyle.locked}
                    onCheckedChange={(checked) => setNewStyle((prev) => ({ ...prev, locked: checked }))}
                  />
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-950 p-2">
                  <div className="text-[11px] text-gray-400 mb-2">Latest generated preview</div>
                  <div className="h-20 rounded border border-gray-800 bg-gray-900 flex items-center justify-center overflow-hidden">
                    {String(lastGeneratedPreviewUrl || newStyle.iconValue || "").trim() ? (
                      // eslint-disable-next-line jsx-a11y/alt-text
                      <img
                        src={String(lastGeneratedPreviewUrl || newStyle.iconValue || "")}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-[11px] text-gray-500">No preview yet</span>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-gray-400">Tip: generate first, then lock to prevent changes.</div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Input
              value={newStyle.color}
              onChange={(e) => setNewStyle((prev) => ({ ...prev, color: e.target.value }))}
              placeholder="#111827"
              className="bg-gray-950 border-gray-700 text-white"
            />
            <Input
              type="number"
              value={newStyle.size}
              onChange={(e) => setNewStyle((prev) => ({ ...prev, size: Number(e.target.value || 28) }))}
              className="bg-gray-950 border-gray-700 text-white"
            />
            <Input
              type="number"
              value={newStyle.zIndex}
              onChange={(e) => setNewStyle((prev) => ({ ...prev, zIndex: Number(e.target.value || 12) }))}
              className="bg-gray-950 border-gray-700 text-white"
            />
            <div className="flex items-center justify-between rounded-md border border-gray-700 px-3 bg-gray-950">
              <span className="text-xs text-gray-300">Active</span>
              <Switch checked={!!newStyle.isActive} onCheckedChange={(checked) => setNewStyle((prev) => ({ ...prev, isActive: checked }))} />
            </div>
            <div className="flex items-center">
              <MarkerPreview style={newStyle} />
            </div>
          </div>
          <Button
            onClick={() => void handleCreateStyle()}
            disabled={
              createStyleMutation.isPending ||
              generateImageMutation.isPending ||
              (newStyleMode === "image" && !String(newStyle.iconPrompt || "").trim())
            }
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {generateImageMutation.isPending && newStyleMode === "image"
              ? "Generating..."
              : newStyleMode === "image"
                ? "Create & generate"
                : "Create style"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Category mapping (advanced override)</CardTitle>
          <CardDescription className="text-gray-400">
            Generation already maps categories automatically. Use this only to override mappings manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-800 p-3 bg-gray-950">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{category.name}</div>
                  <div className="text-[11px] text-gray-500 truncate">{category.slug}</div>
                </div>
                <Select
                  value={categoryMappings[category.id] || "shop_default"}
                  onValueChange={(value) =>
                    setCategoryMappings((prev) => ({ ...prev, [category.id]: value }))
                  }
                >
                  <SelectTrigger className="w-52 bg-gray-900 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-950 border-gray-700 text-white">
                    {styles
                      .filter((style) => style.isActive)
                      .map((style) => (
                        <SelectItem key={style.key} value={style.key}>
                          {style.label} ({style.key})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button
            onClick={() => applyMappingsMutation.mutate()}
            disabled={applyMappingsMutation.isPending || !categories.length}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            Apply to categories
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-white text-lg font-medium">Styles</h2>
        {isLoading ? <div className="text-gray-400 text-sm">Loading styles...</div> : null}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {styles.map((style) => (
            <EditableStyleCard
              key={style.key}
              style={style}
              onSave={(draft) => saveStyleMutation.mutate(draft)}
              onDisable={(key) => disableStyleMutation.mutate(key)}
              onGenerateImage={handleGenerateImage}
              generating={generateImageMutation.isPending && generatingKey === style.key}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
