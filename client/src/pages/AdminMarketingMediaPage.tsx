import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type MediaStatus = "discovered" | "reviewed" | "published" | "rejected";
type MediaType = "article" | "video" | "profile" | "press_release" | "podcast" | "post";

type MediaRow = {
  id: string;
  type: MediaType;
  title: string;
  outlet: string | null;
  url: string;
  canonicalUrl: string | null;
  publishedAt: string | null;
  language: string | null;
  excerpt: string | null;
  summaryParagraph: string | null;
  tags: string[];
  status: MediaStatus;
  thumbnailLocalPath: string | null;
  thumbnailRemoteUrl: string | null;
  mediaEmbedUrl: string | null;
  author: string | null;
  duplicateOf: string | null;
  raw?: any;
  featured?: boolean;
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

export default function AdminMarketingMediaPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageMode, setImageMode] = useState<"quality" | "fast">("quality");
  const [assetBusy, setAssetBusy] = useState(false);
  const [form, setForm] = useState({
    type: "article" as MediaType,
    title: "",
    outlet: "",
    url: "",
    canonicalUrl: "",
    publishedAt: "",
    language: "",
    excerpt: "",
    summaryParagraph: "",
    tags: "",
    status: "discovered" as MediaStatus,
    thumbnailLocalPath: "",
    thumbnailRemoteUrl: "",
    mediaEmbedUrl: "",
    author: "",
    duplicateOf: "",
    featured: false,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryResult = useQuery({
    queryKey: ["admin-marketing-media", query],
    queryFn: async () => {
      const suffix = query ? `?status=all&limit=250&q=${encodeURIComponent(query)}` : "?status=all&limit=250";
      const response = await apiRequest(`/api/admin/marketing/media${suffix}`, { method: "GET" });
      return Array.isArray(response?.items) ? (response.items as MediaRow[]) : [];
    },
  });

  const items = queryResult.data || [];

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  const syncForm = (item: MediaRow | null) => {
    if (!item) {
      setForm({
        type: "article",
        title: "",
        outlet: "",
        url: "",
        canonicalUrl: "",
        publishedAt: "",
        language: "",
        excerpt: "",
        summaryParagraph: "",
        tags: "",
        status: "discovered",
        thumbnailLocalPath: "",
        thumbnailRemoteUrl: "",
        mediaEmbedUrl: "",
        author: "",
        duplicateOf: "",
        featured: false,
      });
      setImagePrompt("");
      return;
    }
    setForm({
      type: item.type,
      title: item.title || "",
      outlet: item.outlet || "",
      url: item.url || "",
      canonicalUrl: item.canonicalUrl || "",
      publishedAt: item.publishedAt ? String(item.publishedAt).slice(0, 10) : "",
      language: item.language || "",
      excerpt: item.excerpt || "",
      summaryParagraph: item.summaryParagraph || "",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
      status: item.status,
      thumbnailLocalPath: item.thumbnailLocalPath || "",
      thumbnailRemoteUrl: item.thumbnailRemoteUrl || "",
      mediaEmbedUrl: item.mediaEmbedUrl || "",
      author: item.author || "",
      duplicateOf: item.duplicateOf || "",
      featured: Boolean(item.featured),
    });
    setImagePrompt(`Media card thumbnail for ${item.title}. outlet ${item.outlet || "media"}.`);
  };

  const assetKey = useMemo(() => {
    const slug = slugify(form.title, selectedId || "media-item");
    return `marketing/media/${slug}/thumbnail`;
  }, [form.title, selectedId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a media item to edit");
      const payload = {
        type: form.type,
        title: form.title,
        outlet: form.outlet,
        url: form.url,
        canonicalUrl: form.canonicalUrl.trim() || null,
        publishedAt: form.publishedAt || null,
        language: form.language.trim() || null,
        excerpt: form.excerpt,
        summaryParagraph: form.summaryParagraph,
        tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
        status: form.status,
        thumbnailLocalPath: form.thumbnailLocalPath,
        thumbnailRemoteUrl: form.thumbnailRemoteUrl,
        mediaEmbedUrl: form.mediaEmbedUrl.trim() || null,
        author: form.author.trim() || null,
        duplicateOf: form.duplicateOf || null,
        featured: form.featured,
      };
      return apiRequest(`/api/admin/marketing/media/${selectedId}`, "PATCH", payload);
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Media item updated." });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media"] });
    },
    onError: (error: any) => toast({ title: "Save failed", description: error?.message || "Unable to update media item.", variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a media item");
      return apiRequest(`/api/admin/marketing/media/${selectedId}/verify`, "POST", {});
    },
    onSuccess: async (res: any) => {
      const ok = Boolean(res?.verified);
      const status = Number(res?.status || 0);
      toast({
        title: ok ? "Verified" : "Verification failed",
        description: ok ? `Link responded with ${status || "OK"}.` : `Link check returned ${status || "no response"}.`,
        variant: ok ? "default" : "destructive",
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media"] });
    },
    onError: (error: any) =>
      toast({ title: "Verify failed", description: error?.message || "Unable to verify url.", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async (action: "published" | "reviewed" | "rejected" | "feature" | "unfeature") => {
      if (!selectedId) throw new Error("Select a media item");
      if (action === "feature" || action === "unfeature") {
        return apiRequest("/api/admin/marketing/media/bulk", "POST", { ids: [selectedId], action });
      }
      return apiRequest("/api/admin/marketing/media/bulk", "POST", { ids: [selectedId], action: action === "published" ? "publish" : action === "reviewed" ? "review" : "reject" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-media"] });
    },
  });

  const suggestPrompt = async () => {
    setAssetBusy(true);
    try {
      const res = await apiRequest("/api/admin/assets/images/suggest-prompt", "POST", {
        namespace: "exportunity",
        assetKey,
        description: `Media thumbnail for ${form.title}. ${form.excerpt}`,
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
        setForm((prev) => ({ ...prev, thumbnailLocalPath: nextPath }));
        toast({ title: "Thumbnail generated", description: "Image generated and attached to media card." });
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
            <CardTitle>Media Review Queue</CardTitle>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" className="border-gray-700 bg-gray-950" />
          </CardHeader>
          <CardContent className="max-h-[72vh] space-y-2 overflow-auto">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  syncForm(item);
                }}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === item.id ? "border-sky-400 bg-sky-500/10" : "border-gray-800 bg-gray-950 hover:bg-gray-900"}`}
              >
                <div className="line-clamp-2 text-sm font-semibold">{item.title}</div>
                <div className="mt-1 text-xs text-gray-400">{item.type} • {item.status}{item.featured ? " • featured" : ""}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-gray-800 bg-gray-900">
          <CardHeader>
            <CardTitle>{selectedItem ? `Review ${selectedItem.type}` : "Select a media item"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <select value={form.type} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as MediaType }))} className="h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm">
                <option value="article">article</option>
                <option value="video">video</option>
                <option value="profile">profile</option>
                <option value="press_release">press_release</option>
                <option value="podcast">podcast</option>
                <option value="post">post</option>
              </select>
              <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MediaStatus }))} className="h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm">
                <option value="discovered">discovered</option>
                <option value="reviewed">reviewed</option>
                <option value="published">published</option>
                <option value="rejected">rejected</option>
              </select>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Title" className="border-gray-700 bg-gray-950" />
              <Input value={form.outlet} onChange={(event) => setForm((prev) => ({ ...prev, outlet: event.target.value }))} placeholder="Outlet" className="border-gray-700 bg-gray-950" />
              <Input value={form.url} onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="URL" className="border-gray-700 bg-gray-950" />
              <Input value={form.canonicalUrl} onChange={(event) => setForm((prev) => ({ ...prev, canonicalUrl: event.target.value }))} placeholder="Canonical URL (optional)" className="border-gray-700 bg-gray-950" />
              <Input value={form.publishedAt} onChange={(event) => setForm((prev) => ({ ...prev, publishedAt: event.target.value }))} type="date" className="border-gray-700 bg-gray-950" />
              <Input value={form.language} onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))} placeholder="Language (e.g. en, fr)" className="border-gray-700 bg-gray-950" />
              <Input value={form.author} onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))} placeholder="Author (optional)" className="border-gray-700 bg-gray-950" />
              <Input value={form.mediaEmbedUrl} onChange={(event) => setForm((prev) => ({ ...prev, mediaEmbedUrl: event.target.value }))} placeholder="Media embed URL (video/podcast, optional)" className="border-gray-700 bg-gray-950" />
              <Input value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Tags comma-separated" className="border-gray-700 bg-gray-950" />
              <Input value={form.duplicateOf} onChange={(event) => setForm((prev) => ({ ...prev, duplicateOf: event.target.value }))} placeholder="Duplicate of media ID (optional)" className="border-gray-700 bg-gray-950" />
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input type="checkbox" checked={form.featured} onChange={(event) => setForm((prev) => ({ ...prev, featured: event.target.checked }))} />
                Feature this item on public media pages
              </label>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Link verification</div>
                  <div className="text-xs text-gray-400">
                    {selectedItem?.raw?.linkCheck?.checkedAt ? (
                      <span>
                        Last checked: {String(selectedItem.raw.linkCheck.checkedAt)} • status {String(selectedItem.raw.linkCheck.status ?? "")} •{" "}
                        {selectedItem.raw.linkCheck.ok ? "ok" : "failed"}
                      </span>
                    ) : (
                      <span>Not verified yet.</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    disabled={!selectedId || verifyMutation.isPending || !(form.canonicalUrl.trim() || form.url.trim())}
                    onClick={() => verifyMutation.mutate()}
                  >
                    {verifyMutation.isPending ? "Verifying..." : "Verify URL"}
                  </Button>
                  {selectedItem?.canonicalUrl || selectedItem?.url ? (
                    <a href={(selectedItem.canonicalUrl || selectedItem.url) as string} target="_blank" rel="noreferrer">
                      <Button variant="secondary">Open Canonical</Button>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4 space-y-3">
              <div className="text-sm font-semibold">Thumbnail image</div>
              <Input value={form.thumbnailLocalPath} onChange={(event) => setForm((prev) => ({ ...prev, thumbnailLocalPath: event.target.value }))} placeholder="Thumbnail local path" className="border-gray-700 bg-gray-950" />
              <Input value={form.thumbnailRemoteUrl} onChange={(event) => setForm((prev) => ({ ...prev, thumbnailRemoteUrl: event.target.value }))} placeholder="Thumbnail remote URL" className="border-gray-700 bg-gray-950" />
              {form.thumbnailLocalPath || form.thumbnailRemoteUrl ? <img src={form.thumbnailLocalPath || form.thumbnailRemoteUrl} alt="Thumbnail preview" className="h-44 w-full rounded-lg border border-gray-800 object-cover" /> : null}
              <Input value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="Prompt for AI generation" className="border-gray-700 bg-gray-950" />
              <div className="flex flex-wrap gap-2">
                <Select value={imageMode} onValueChange={(value) => setImageMode(value as "quality" | "fast")}>
                  <SelectTrigger className="w-[130px] border-gray-700 bg-gray-950 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-gray-700 bg-gray-950 text-white">
                    <SelectItem value="quality">quality</SelectItem>
                    <SelectItem value="fast">fast</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" disabled={assetBusy || !form.title.trim()} onClick={suggestPrompt}>Suggest prompt</Button>
                <Button disabled={assetBusy || !imagePrompt.trim()} onClick={generateThumbnail}>{assetBusy ? "Working..." : "Generate thumbnail"}</Button>
                <a href={`/admin/media/assets?tab=library&namespace=exportunity&q=${encodeURIComponent(assetKey)}`} target="_blank" rel="noreferrer"><Button variant="secondary">Open Asset Studio</Button></a>
              </div>
            </div>

            <Textarea value={form.excerpt} onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))} placeholder="Excerpt" className="min-h-[120px] border-gray-700 bg-gray-950" />
            <Textarea value={form.summaryParagraph} onChange={(event) => setForm((prev) => ({ ...prev, summaryParagraph: event.target.value }))} placeholder="Summary paragraph" className="min-h-[180px] border-gray-700 bg-gray-950" />

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !selectedId || !form.title.trim() || !form.url.trim()}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" disabled={!selectedId || statusMutation.isPending} onClick={() => statusMutation.mutate("reviewed")}>Mark Reviewed</Button>
              <Button variant="secondary" disabled={!selectedId || statusMutation.isPending} onClick={() => statusMutation.mutate("published")}>Publish</Button>
              <Button variant="destructive" disabled={!selectedId || statusMutation.isPending} onClick={() => statusMutation.mutate("rejected")}>Reject</Button>
              <Button variant="outline" disabled={!selectedId || statusMutation.isPending} onClick={() => statusMutation.mutate("feature")}>Feature</Button>
              <Button variant="outline" disabled={!selectedId || statusMutation.isPending} onClick={() => statusMutation.mutate("unfeature")}>Unfeature</Button>
              {selectedItem?.url ? (
                <a href={selectedItem.url} target="_blank" rel="noreferrer">
                  <Button variant="outline">Open Source</Button>
                </a>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
