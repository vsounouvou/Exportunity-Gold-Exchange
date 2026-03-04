import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type StatusValue = "draft" | "published" | "archived";

type LibraryRow = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  language: string | null;
  duration: string | null;
  externalUrl: string | null;
  embedUrl: string | null;
  thumbnailLocal: string | null;
  tags: string[];
  status: StatusValue;
  sortOrder: number;
  publishedAt: string | null;
};

function slugify(value: string, fallback: string) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || fallback;
}

function normalizePath(path: string) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export default function AdminMarketingLibraryPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageMode, setImageMode] = useState<"quality" | "fast">("quality");
  const [assetBusy, setAssetBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    description: "",
    category: "",
    language: "",
    duration: "",
    externalUrl: "",
    embedUrl: "",
    thumbnailLocal: "",
    tags: "",
    status: "draft" as StatusValue,
    sortOrder: "0",
    publishedAt: "",
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryResult = useQuery({
    queryKey: ["admin-marketing-library", query],
    queryFn: async () => {
      const suffix = query ? `?status=all&limit=250&q=${encodeURIComponent(query)}` : "?status=all&limit=250";
      const response = await apiRequest(`/api/admin/marketing/library${suffix}`, { method: "GET" });
      return Array.isArray(response?.items) ? (response.items as LibraryRow[]) : [];
    },
  });

  const items = queryResult.data || [];

  const syncForm = (item: LibraryRow | null) => {
    if (!item) {
      setForm({ title: "", slug: "", description: "", category: "", language: "", duration: "", externalUrl: "", embedUrl: "", thumbnailLocal: "", tags: "", status: "draft", sortOrder: "0", publishedAt: "" });
      setImagePrompt("");
      return;
    }
    setForm({
      title: item.title || "",
      slug: item.slug || "",
      description: item.description || "",
      category: item.category || "",
      language: item.language || "",
      duration: item.duration || "",
      externalUrl: item.externalUrl || "",
      embedUrl: item.embedUrl || "",
      thumbnailLocal: item.thumbnailLocal || "",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
      status: item.status || "draft",
      sortOrder: String(item.sortOrder ?? 0),
      publishedAt: item.publishedAt ? String(item.publishedAt).slice(0, 10) : "",
    });
    setImagePrompt(`Library thumbnail for ${item.title}. Category: ${item.category || "resource"}.`);
  };

  const assetKey = useMemo(() => {
    const slug = slugify(form.slug || form.title, selectedId ? `library-${selectedId}` : "new-library");
    return `marketing/library/${slug}/thumbnail`;
  }, [form.slug, form.title, selectedId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        slug: form.slug,
        description: form.description,
        category: form.category,
        language: form.language,
        duration: form.duration,
        externalUrl: form.externalUrl,
        embedUrl: form.embedUrl,
        thumbnailLocal: form.thumbnailLocal,
        tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
        status: form.status,
        sortOrder: Number.parseInt(form.sortOrder || "0", 10) || 0,
        publishedAt: form.publishedAt || null,
      };

      if (selectedId) return apiRequest(`/api/admin/marketing/library/${selectedId}`, "PATCH", payload);
      return apiRequest("/api/admin/marketing/library", "POST", payload);
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Library item saved." });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-library"] });
      setSelectedId(null);
      syncForm(null);
    },
    onError: (error: any) => toast({ title: "Save failed", description: error?.message || "Unable to save.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/marketing/library/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast({ title: "Deleted", description: "Library item deleted." });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-library"] });
      setSelectedId(null);
      syncForm(null);
    },
    onError: (error: any) => toast({ title: "Delete failed", description: error?.message || "Unable to delete.", variant: "destructive" }),
  });

  const suggestPrompt = async () => {
    setAssetBusy(true);
    try {
      const res = await apiRequest("/api/admin/assets/images/suggest-prompt", "POST", {
        namespace: "exportunity",
        assetKey,
        description: `Library thumbnail for ${form.title}. ${form.description}`,
        aspect: "16:9",
      });
      const prompt = String(res?.prompt || "").trim();
      if (prompt) {
        setImagePrompt(prompt);
        toast({ title: "Prompt suggested", description: "Prompt ready for generation." });
      }
    } catch (error: any) {
      toast({ title: "Suggest failed", description: error?.message || "Unable to suggest prompt", variant: "destructive" });
    } finally {
      setAssetBusy(false);
    }
  };

  const generateThumbnail = async () => {
    if (!imagePrompt.trim()) return;
    setAssetBusy(true);
    try {
      const res = await apiRequest("/api/admin/assets/images/generate", "POST", {
        namespace: "exportunity",
        assetKey,
        prompt: imagePrompt.trim(),
        mode: imageMode,
        input: { aspect_ratio: "16:9", output_format: "png" },
        setActive: true,
      });
      const nextPath = normalizePath(res?.image?.storedUrl || res?.image?.sourceUrl || "");
      if (nextPath) {
        setForm((prev) => ({ ...prev, thumbnailLocal: nextPath }));
        toast({ title: "Thumbnail generated", description: "Image generated and linked to this library item." });
      }
    } catch (error: any) {
      toast({ title: "Generate failed", description: error?.message || "Unable to generate image", variant: "destructive" });
    } finally {
      setAssetBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[360px,1fr]">
        <Card className="border-gray-800 bg-gray-900">
          <CardHeader>
            <CardTitle>Library</CardTitle>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library" className="border-gray-700 bg-gray-950" />
            <Button onClick={() => { setSelectedId(null); syncForm(null); }}>New Library Item</Button>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-2 overflow-auto">
            {items.map((item) => (
              <button key={item.id} onClick={() => { setSelectedId(item.id); syncForm(item); }} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === item.id ? "border-sky-400 bg-sky-500/10" : "border-gray-800 bg-gray-950 hover:bg-gray-900"}`}>
                <div className="line-clamp-2 text-sm font-semibold">{item.title}</div>
                <div className="mt-1 text-xs text-gray-400">{item.category || "Library"}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-gray-800 bg-gray-900">
          <CardHeader>
            <CardTitle>{selectedId ? `Edit Library #${selectedId}` : "Create Library Item"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Title" className="border-gray-700 bg-gray-950" />
              <Input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} placeholder="Slug" className="border-gray-700 bg-gray-950" />
              <Input value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="Category" className="border-gray-700 bg-gray-950" />
              <Input value={form.language} onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))} placeholder="Language" className="border-gray-700 bg-gray-950" />
              <Input value={form.duration} onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))} placeholder="Duration" className="border-gray-700 bg-gray-950" />
              <Input value={form.publishedAt} onChange={(event) => setForm((prev) => ({ ...prev, publishedAt: event.target.value }))} type="date" className="border-gray-700 bg-gray-950" />
              <Input value={form.externalUrl} onChange={(event) => setForm((prev) => ({ ...prev, externalUrl: event.target.value }))} placeholder="External URL" className="border-gray-700 bg-gray-950" />
              <Input value={form.embedUrl} onChange={(event) => setForm((prev) => ({ ...prev, embedUrl: event.target.value }))} placeholder="Embed URL" className="border-gray-700 bg-gray-950" />
              <Input value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Tags comma-separated" className="border-gray-700 bg-gray-950" />
              <Input value={form.sortOrder} onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))} type="number" placeholder="Sort order" className="border-gray-700 bg-gray-950" />
              <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as StatusValue }))} className="h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm">
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-3">
              <div className="text-sm font-semibold">Thumbnail image</div>
              <Input value={form.thumbnailLocal} onChange={(event) => setForm((prev) => ({ ...prev, thumbnailLocal: event.target.value }))} placeholder="Thumbnail local path" className="border-gray-700 bg-gray-950" />
              {form.thumbnailLocal ? <img src={form.thumbnailLocal} alt="Thumbnail preview" className="h-44 w-full rounded-lg border border-gray-800 object-cover" /> : null}
              <Input value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="Prompt for AI generation" className="border-gray-700 bg-gray-950" />
              <div className="flex flex-wrap gap-2">
                <Select value={imageMode} onValueChange={(value) => setImageMode(value as "quality" | "fast")}>
                  <SelectTrigger className="w-[130px] border-gray-700 bg-gray-950 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-gray-700 bg-gray-950 text-white">
                    <SelectItem value="quality">quality</SelectItem>
                    <SelectItem value="fast">fast</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={suggestPrompt} disabled={assetBusy || !form.title.trim()}>Suggest prompt</Button>
                <Button onClick={generateThumbnail} disabled={assetBusy || !imagePrompt.trim()}>{assetBusy ? "Working..." : "Generate thumbnail"}</Button>
                <a href={`/admin/media/assets?tab=library&namespace=exportunity&q=${encodeURIComponent(assetKey)}`} target="_blank" rel="noreferrer"><Button variant="secondary">Open Asset Studio</Button></a>
              </div>
            </div>

            <Textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Description" className="min-h-[180px] border-gray-700 bg-gray-950" />

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title.trim()}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
              {selectedId ? <Button variant="destructive" onClick={() => deleteMutation.mutate(selectedId)} disabled={deleteMutation.isPending}>Delete</Button> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
