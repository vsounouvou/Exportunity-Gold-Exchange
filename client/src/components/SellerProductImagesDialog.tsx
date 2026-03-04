import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, RefreshCcw, Sparkles, Star, Trash2, UploadCloud, Wand2 } from "lucide-react";

type SlotActive = { url: string | null; updatedAt: number | null; activeImageId: string | null };

type ProductImageSlot = {
  id: string;
  role: string;
  position: number;
  label: string | null;
  assetNamespace: string;
  assetKey: string;
  metadata: any;
  active: SlotActive;
};

type ProductImageSuggestion = {
  sourceProductId: number;
  sourceProductName: string;
  sourceCategorySlug: string;
  score: number;
  imageId: string;
  imageUrl: string;
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

function slotTitle(slot: ProductImageSlot) {
  const label = String(slot.label || "").trim();
  if (label) return label;
  const role = String(slot.role || "").trim();
  return role || "Image";
}

export function SellerProductImagesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number | null;
  productName?: string | null;
}) {
  const { open, onOpenChange, productId, productName } = props;

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ProductImagesPayload | null>(null);
  const [basePrompt, setBasePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [count, setCount] = useState(8);
  const [suggestions, setSuggestions] = useState<ProductImageSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [promptSuggesting, setPromptSuggesting] = useState(false);

  const [slotEdits, setSlotEdits] = useState<Record<string, { promptOverride: string; negativePromptOverride: string }>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadRef = useRef<ProductImageSlot | null>(null);

  const slots = payload?.slots || [];
  const primarySlot = useMemo(() => {
    if (!payload?.primaryAssetKey) return null;
    return slots.find((s) => String(s.assetKey) === String(payload.primaryAssetKey)) || null;
  }, [payload?.primaryAssetKey, slots]);

  const loadSuggestions = async () => {
    if (!productId) return;
    setSuggestionsLoading(true);
    try {
      const res = (await apiRequest(`/api/seller/products/${productId}/images/suggestions?limit=8`)) as {
        suggestions?: ProductImageSuggestion[];
      };
      const next = Array.isArray(res?.suggestions) ? res.suggestions : [];
      setSuggestions(next);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const load = async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await apiRequest(`/api/seller/products/${productId}/images`)) as ProductImagesPayload;
      setPayload(res);
      setBasePrompt(String(res?.basePrompt || ""));
      setNegativePrompt(String(res?.negativePrompt || ""));
      setSlotEdits(() => {
        const next: Record<string, { promptOverride: string; negativePromptOverride: string }> = {};
        for (const slot of res?.slots || []) {
          const meta = slot?.metadata && typeof slot.metadata === "object" ? slot.metadata : {};
          next[String(slot.id)] = {
            promptOverride: typeof (meta as any).promptOverride === "string" ? String((meta as any).promptOverride) : "",
            negativePromptOverride:
              typeof (meta as any).negativePromptOverride === "string" ? String((meta as any).negativePromptOverride) : "",
          };
        }
        return next;
      });
      await loadSuggestions();
    } catch (err: any) {
      setError(err?.message || "Failed to load images");
      setPayload(null);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId]);

  const saveSettings = async () => {
    if (!productId) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/seller/products/${productId}/images/update-settings`, {
        method: "POST",
        body: JSON.stringify({ basePrompt, negativePrompt }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to save prompts");
    } finally {
      setBusy(false);
    }
  };

  const suggestPrompt = async () => {
    if (!productId) return;
    setPromptSuggesting(true);
    setError(null);
    try {
      const res = (await apiRequest(`/api/seller/products/${productId}/images/suggest-prompt`, {
        method: "POST",
        body: JSON.stringify({
          currentPrompt: basePrompt,
          negativePrompt,
          language: "fr",
        }),
      })) as { prompt?: string; negativePrompt?: string };

      const nextPrompt = String(res?.prompt || "").trim();
      const nextNegative = String(res?.negativePrompt || "").trim();
      if (nextPrompt) setBasePrompt(nextPrompt);
      if (nextNegative) setNegativePrompt(nextNegative);
    } catch (err: any) {
      setError(err?.message || "Failed to suggest prompt");
    } finally {
      setPromptSuggesting(false);
    }
  };

  const saveSlot = async (slot: ProductImageSlot) => {
    if (!productId) return;
    const edit = slotEdits[String(slot.id)] || { promptOverride: "", negativePromptOverride: "" };
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/seller/products/${productId}/images/update-slot`, {
        method: "POST",
        body: JSON.stringify({
          slotId: slot.id,
          promptOverride: edit.promptOverride,
          negativePromptOverride: edit.negativePromptOverride,
        }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to save slot prompt");
    } finally {
      setBusy(false);
    }
  };

  const generateOne = async (slot: ProductImageSlot) => {
    if (!productId) return;
    const edit = slotEdits[String(slot.id)] || { promptOverride: "", negativePromptOverride: "" };
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/seller/products/${productId}/images/generate-one`, {
        method: "POST",
        body: JSON.stringify({
          slotId: slot.id,
          setActive: true,
          ...(edit.promptOverride.trim() ? { prompt: edit.promptOverride.trim() } : {}),
          ...(edit.negativePromptOverride.trim() ? { negativePrompt: edit.negativePromptOverride.trim() } : {}),
        }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to generate image");
    } finally {
      setBusy(false);
    }
  };

  const enhanceSlot = async (slot: ProductImageSlot) => {
    if (!productId) return;
    const edit = slotEdits[String(slot.id)] || { promptOverride: "", negativePromptOverride: "" };
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/seller/products/${productId}/images/enhance`, {
        method: "POST",
        body: JSON.stringify({
          slotId: slot.id,
          ...(edit.promptOverride.trim() ? { prompt: edit.promptOverride.trim() } : {}),
          ...(edit.negativePromptOverride.trim() ? { negativePrompt: edit.negativePromptOverride.trim() } : {}),
        }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to enhance image");
    } finally {
      setBusy(false);
    }
  };

  const generateSet = async () => {
    if (!productId) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/seller/products/${productId}/images/generate-set`, {
        method: "POST",
        body: JSON.stringify({
          count,
          setActive: true,
          basePrompt: basePrompt.trim() || undefined,
          negativePrompt: negativePrompt.trim() || undefined,
        }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to generate set");
    } finally {
      setBusy(false);
    }
  };

  const setPrimaryByImageId = async (imageId: string) => {
    if (!productId) return;
    if (!imageId) {
      setError("No image selected for primary.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/seller/products/${productId}/images/set-primary`, {
        method: "POST",
        body: JSON.stringify({ imageId }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to set primary");
    } finally {
      setBusy(false);
    }
  };

  const setPrimary = async (slot: ProductImageSlot) => {
    await setPrimaryByImageId(slot.active?.activeImageId || "");
  };

  const applySuggestionToSlot = async (slot: ProductImageSlot, imageId: string) => {
    if (!productId) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/seller/products/${productId}/images/apply-suggestion`, {
        method: "POST",
        body: JSON.stringify({ imageId, slotId: slot.id }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to apply suggested image");
    } finally {
      setBusy(false);
    }
  };

  const deleteSlot = async (slot: ProductImageSlot) => {
    if (!productId) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/seller/products/${productId}/images/${slot.id}`, { method: "DELETE" });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to delete slot");
    } finally {
      setBusy(false);
    }
  };

  const openUpload = (slot: ProductImageSlot) => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    pendingUploadRef.current = slot;
    fileInputRef.current.click();
  };

  const uploadFile = async (slot: ProductImageSlot, file: File) => {
    const form = new FormData();
    form.append("namespace", "products");
    form.append("assetKey", slot.assetKey);
    form.append("setActive", "true");
    form.append("file", file, file.name);

    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/seller/assets/images/upload", { method: "POST", body: form });
      await load();
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const bestSuggestion = suggestions.length ? suggestions[0] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl bg-slate-950 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="truncate">Images & prompts{productName ? ` - ${productName}` : ""}</span>
            {payload?.tenantKey ? (
              <Badge variant="outline" className="border-slate-700">
                {payload.tenantKey}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            Tune prompts, generate accurate visuals, reuse matching photos, and enhance uploaded images with AI.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const slot = pendingUploadRef.current;
            if (!slot) return;
            pendingUploadRef.current = null;
            void uploadFile(slot, file);
          }}
        />

        {error ? <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : !payload ? (
          <div className="text-sm text-slate-300">No image data available.</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-200 text-xs">Base prompt</Label>
                <Textarea
                  value={basePrompt}
                  onChange={(e) => setBasePrompt(e.target.value)}
                  className="min-h-[120px] bg-slate-900 border-slate-800 text-white"
                  placeholder="Base prompt"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200 text-xs">Negative prompt</Label>
                <Textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  className="min-h-[120px] bg-slate-900 border-slate-800 text-white"
                  placeholder="Negative prompt"
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button onClick={saveSettings} disabled={busy} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save prompts
                </Button>
                <Button variant="outline" className="border-slate-700" onClick={suggestPrompt} disabled={busy || promptSuggesting}>
                  {promptSuggesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                  AI suggest
                </Button>
                <div className="flex items-center gap-2">
                  <Label className="text-slate-200 text-xs">Set size</Label>
                  <Input
                    value={String(count)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value || "0", 10);
                      if (!Number.isFinite(n)) return;
                      setCount(Math.max(1, Math.min(12, n)));
                    }}
                    className="w-20 bg-slate-900 border-slate-800 text-white"
                  />
                </div>
                <Button variant="secondary" onClick={generateSet} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Generate set
                </Button>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Primary slot: <span className="text-slate-200">{primarySlot ? slotTitle(primarySlot) : "unknown"}</span> - Aspect:{" "}
              <span className="text-slate-200">{payload.aspect}</span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-100">Suggested existing photos</div>
                <Button variant="ghost" size="sm" onClick={() => void loadSuggestions()} disabled={busy || suggestionsLoading}>
                  {suggestionsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                  Refresh
                </Button>
              </div>
              {suggestions.length === 0 ? (
                <div className="text-xs text-slate-400">No close match found yet. Generate or upload a primary image first.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {suggestions.map((suggestion) => (
                    <div key={`${suggestion.sourceProductId}-${suggestion.imageId}`} className="rounded-lg border border-slate-800 bg-slate-950/40 overflow-hidden">
                      <div className="aspect-square bg-slate-950/70">
                        <img src={suggestion.imageUrl} alt={suggestion.sourceProductName} className="h-full w-full object-cover" />
                      </div>
                      <div className="p-2 space-y-2">
                        <div className="text-xs text-slate-200 line-clamp-2">{suggestion.sourceProductName}</div>
                        <div className="text-[11px] text-slate-400">Match {Math.round(Number(suggestion.score || 0) * 100)}%</div>
                        <Button size="sm" className="w-full" disabled={busy} onClick={() => setPrimaryByImageId(suggestion.imageId)}>
                          Use as primary
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {slots.map((slot) => {
                const edit = slotEdits[String(slot.id)] || { promptOverride: "", negativePromptOverride: "" };
                const isPrimary = primarySlot && String(primarySlot.id) === String(slot.id);
                const url = slot.active?.url || null;

                return (
                  <div key={slot.id} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="font-semibold truncate">{slotTitle(slot)}</div>
                          {isPrimary ? (
                            <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/30">
                              <Star className="h-3 w-3 mr-1" /> Primary
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">{slot.assetKey}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => openUpload(slot)}>
                          <UploadCloud className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                        <Button size="sm" variant="outline" className="border-slate-700" disabled={busy || !url} onClick={() => enhanceSlot(slot)}>
                          <Wand2 className="h-4 w-4 mr-2" />
                          Enhance
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => generateOne(slot)}>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/30 overflow-hidden">
                        <div className="aspect-square bg-slate-950/50">
                          {url ? (
                            <img src={url} alt={slotTitle(slot)} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">No image</div>
                          )}
                        </div>
                        <div className="p-2 flex items-center justify-between gap-2">
                          {!isPrimary ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-700"
                              disabled={busy || !slot.active?.activeImageId}
                              onClick={() => setPrimary(slot)}
                            >
                              <Star className="h-4 w-4 mr-2" />
                              Set primary
                            </Button>
                          ) : (
                            <div className="text-[11px] text-slate-400">Primary image</div>
                          )}
                          {!isPrimary ? (
                            <Button size="sm" variant="destructive" disabled={busy} onClick={() => deleteSlot(slot)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-slate-200 text-xs">Prompt override (optional)</Label>
                          <Textarea
                            value={edit.promptOverride}
                            onChange={(e) =>
                              setSlotEdits((prev) => ({ ...prev, [String(slot.id)]: { ...edit, promptOverride: e.target.value } }))
                            }
                            className="min-h-[90px] bg-slate-900 border-slate-800 text-white"
                            placeholder="Leave empty to use base prompt"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-slate-200 text-xs">Negative override (optional)</Label>
                          <Textarea
                            value={edit.negativePromptOverride}
                            onChange={(e) =>
                              setSlotEdits((prev) => ({
                                ...prev,
                                [String(slot.id)]: { ...edit, negativePromptOverride: e.target.value },
                              }))
                            }
                            className="min-h-[70px] bg-slate-900 border-slate-800 text-white"
                            placeholder="Leave empty to use base negative prompt"
                          />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => saveSlot(slot)}>
                            Save slot prompt
                          </Button>
                          {bestSuggestion ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-700"
                              disabled={busy}
                              onClick={() => applySuggestionToSlot(slot, bestSuggestion.imageId)}
                            >
                              Use best match
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" className="border-slate-700" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
