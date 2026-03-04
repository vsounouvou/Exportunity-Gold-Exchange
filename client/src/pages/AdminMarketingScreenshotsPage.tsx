import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ScreenshotStatus = "draft" | "published" | "archived";

type ScreenshotRow = {
  id: number;
  slug: string;
  title: string;
  module: string;
  caption: string | null;
  imageLocalPath: string;
  tags: string[];
  status: ScreenshotStatus;
  sortOrder: number;
  updatedAt: string;
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

export default function AdminMarketingScreenshotsPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageMode, setImageMode] = useState<"quality" | "fast">("quality");
  const [form, setForm] = useState({
    slug: "",
    title: "",
    module: "platform",
    caption: "",
    imageLocalPath: "",
    tags: "",
    status: "draft" as ScreenshotStatus,
    sortOrder: 0,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryResult = useQuery({
    queryKey: ["admin-marketing-screenshots", query],
    queryFn: async () => {
      const suffix = query ? `?status=all&limit=250&q=${encodeURIComponent(query)}` : "?status=all&limit=250";
      const response = await apiRequest(`/api/admin/marketing/screenshots${suffix}`, { method: "GET" });
      return Array.isArray(response?.items) ? (response.items as ScreenshotRow[]) : [];
    },
  });

  const items = queryResult.data || [];

  const selected = useMemo(
    () => (selectedId ? items.find((row) => Number(row.id) === Number(selectedId)) || null : null),
    [items, selectedId],
  );

  const syncForm = (row: ScreenshotRow | null) => {
    if (!row) {
      setForm({ slug: "", title: "", module: "platform", caption: "", imageLocalPath: "", tags: "", status: "draft", sortOrder: 0 });
      setImagePrompt("");
      return;
    }
    setForm({
      slug: row.slug || "",
      title: row.title || "",
      module: row.module || "platform",
      caption: row.caption || "",
      imageLocalPath: row.imageLocalPath || "",
      tags: Array.isArray(row.tags) ? row.tags.join(", ") : "",
      status: row.status,
      sortOrder: row.sortOrder || 0,
    });
    setImagePrompt(`Platform screenshot tile for module ${row.module}. clean UI, dark theme, crisp typography, gold accents.`);
  };

  const assetKey = useMemo(() => {
    const slug = slugify(form.slug || form.title, selectedId ? `shot-${selectedId}` : "new-shot");
    return `marketing/screenshots/${slug}/image`;
  }, [form.slug, form.title, selectedId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title required");
      if (!form.imageLocalPath.trim()) throw new Error("Image path required");
      const payload = {
        slug: form.slug.trim() || slugify(form.title, `shot-${Date.now()}`),
        title: form.title.trim(),
        module: form.module.trim() || "platform",
        caption: form.caption.trim() || null,
        imageLocalPath: normalizePath(form.imageLocalPath),
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        status: form.status,
        sortOrder: Number(form.sortOrder) || 0,
      };
      return apiRequest("/api/admin/marketing/screenshots", "POST", payload);
    },
    onSuccess: async (res: any) => {
      const id = Number(res?.item?.id || res?.id || 0);
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-screenshots"] });
      if (id) setSelectedId(id);
      toast({ title: "Screenshot created", description: "Saved to CMS." });
    },
    onError: (err: any) => toast({ title: "Create failed", description: err?.message || "Unable to create", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a screenshot");
      const payload = {
        slug: form.slug.trim() || slugify(form.title, `shot-${selectedId}`),
        title: form.title.trim(),
        module: form.module.trim() || "platform",
        caption: form.caption.trim() || null,
        imageLocalPath: normalizePath(form.imageLocalPath),
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        status: form.status,
        sortOrder: Number(form.sortOrder) || 0,
      };
      return apiRequest(`/api/admin/marketing/screenshots/${selectedId}`, "PATCH", payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-screenshots"] });
      toast({ title: "Saved", description: "Screenshot updated." });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err?.message || "Unable to save", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a screenshot");
      return apiRequest(`/api/admin/marketing/screenshots/${selectedId}`, { method: "DELETE" });
    },
    onSuccess: async () => {
      setSelectedId(null);
      syncForm(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-screenshots"] });
      toast({ title: "Deleted", description: "Screenshot removed." });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err?.message || "Unable to delete", variant: "destructive" }),
  });

  const upload = async (file: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("namespace", "exportunity");
      formData.set("assetKey", assetKey);
      formData.set("setActive", "true");
      formData.set("file", file, file.name);

      const resp = await fetch("/api/admin/assets/images/upload", { method: "POST", body: formData });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      const nextPath = normalizePath(data?.image?.storedUrl || data?.image?.sourceUrl || "");
      if (nextPath) {
        setForm((prev) => ({ ...prev, imageLocalPath: nextPath }));
        toast({ title: "Uploaded", description: "Image uploaded and linked." });
      }
    } catch (error: any) {
      toast({ title: "Upload failed", description: error?.message || "Unable to upload", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const suggestPrompt = async () => {
    setBusy(true);
    try {
      const res = await apiRequest("/api/admin/assets/images/suggest-prompt", "POST", {
        namespace: "exportunity",
        assetKey,
        description: `Screenshot/diagram tile for ${form.module}. ${form.title}. ${form.caption}`,
        aspect: "16:9",
      });
      const prompt = String(res?.prompt || "").trim();
      if (prompt) setImagePrompt(prompt);
    } catch (error: any) {
      toast({ title: "Suggest failed", description: error?.message || "Unable to suggest prompt", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!imagePrompt.trim()) return;
    setBusy(true);
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
      if (nextPath) setForm((prev) => ({ ...prev, imageLocalPath: nextPath }));
    } catch (error: any) {
      toast({ title: "Generate failed", description: error?.message || "Unable to generate", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[360px,1fr]">
        <Card className="border-gray-800 bg-gray-900">
          <CardHeader>
            <CardTitle>Screenshots</CardTitle>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="border-gray-700 bg-gray-950" />
            <div className="pt-2">
              <Button
                size="sm"
                className="w-full bg-amber-400 text-slate-950 hover:bg-amber-300"
                onClick={() => {
                  setSelectedId(null);
                  syncForm(null);
                }}
              >
                New screenshot
              </Button>
            </div>
          </CardHeader>
          <CardContent className="max-h-[72vh] space-y-2 overflow-auto">
            {items.map((row) => (
              <button
                key={row.id}
                onClick={() => {
                  setSelectedId(row.id);
                  syncForm(row);
                }}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selectedId === row.id ? "border-sky-400 bg-sky-500/10" : "border-gray-800 bg-gray-950 hover:bg-gray-900"
                }`}
              >
                <div className="line-clamp-2 text-sm font-semibold">{row.title}</div>
                <div className="mt-1 text-xs text-gray-400">
                  {row.module} • {row.status} • sort {row.sortOrder}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-gray-800 bg-gray-900">
          <CardHeader>
            <CardTitle>{selected ? `Edit screenshot #${selected.id}` : "Create screenshot"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="border-gray-700 bg-gray-950" />
              <Input value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} placeholder="Slug" className="border-gray-700 bg-gray-950" />
              <Input value={form.module} onChange={(e) => setForm((p) => ({ ...p, module: e.target.value }))} placeholder="Module (e.g., Agents)" className="border-gray-700 bg-gray-950" />
              <Input value={String(form.sortOrder)} onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))} placeholder="Sort order" className="border-gray-700 bg-gray-950" />
              <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="Tags (comma separated)" className="border-gray-700 bg-gray-950 md:col-span-2" />
              <Textarea value={form.caption} onChange={(e) => setForm((p) => ({ ...p, caption: e.target.value }))} placeholder="Caption" className="min-h-[90px] border-gray-700 bg-gray-950 md:col-span-2" />
              <Input value={form.imageLocalPath} onChange={(e) => setForm((p) => ({ ...p, imageLocalPath: e.target.value }))} placeholder="Image local path (/assets/...)" className="border-gray-700 bg-gray-950 md:col-span-2" />
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ScreenshotStatus }))} className="h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm md:col-span-2">
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </div>

            {form.imageLocalPath ? (
              <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950">
                <img src={normalizePath(form.imageLocalPath)} alt={form.title || "screenshot"} className="aspect-video w-full object-cover" />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm hover:bg-gray-900">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                />
                Upload image
              </label>

              <Button variant="secondary" className="border border-gray-700 bg-gray-950 text-white hover:bg-gray-900" disabled={busy} onClick={() => void suggestPrompt()}>
                Suggest prompt
              </Button>
              <select value={imageMode} onChange={(e) => setImageMode(e.target.value as any)} className="h-10 rounded-md border border-gray-700 bg-gray-950 px-3 text-sm">
                <option value="quality">quality</option>
                <option value="fast">fast</option>
              </select>
              <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300" disabled={busy || !imagePrompt.trim()} onClick={() => void generate()}>
                Generate
              </Button>
            </div>

            <Textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="Prompt (optional)" className="min-h-[90px] border-gray-700 bg-gray-950" />

            <div className="flex flex-wrap items-center gap-2">
              {selected ? (
                <>
                  <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                    Save
                  </Button>
                  <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                    Delete
                  </Button>
                </>
              ) : (
                <Button className="bg-amber-400 text-slate-950 hover:bg-amber-300" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                  Create
                </Button>
              )}
              {busy ? <span className="text-xs text-gray-400">Working…</span> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

