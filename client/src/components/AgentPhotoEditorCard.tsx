import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useToast } from "@/hooks/use-toast";
import { getAgentAvatarUrl } from "@/lib/agentAvatar";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

type GeneratedImage = {
  id: string;
  status: string;
  storedUrl?: string | null;
  prompt?: string | null;
  error?: string | null;
  createdAt?: string | null;
};

type AgentPhotoBundle = {
  ok: boolean;
  agent: {
    id: number;
    name: string;
    role: string;
    country?: string | null;
    photoPrompt?: string | null;
    photoLocked?: boolean | null;
    photoAssetId?: string | null;
  };
  activeImage?: GeneratedImage | null;
  variants: GeneratedImage[];
};

type StylePresetKey = "corporate" | "afrofuturistic" | "minimal" | "illustrated";

function defaultPrompt(agent: AgentPhotoBundle["agent"]) {
  const name = agent.name || "team member";
  const role = agent.role || "Operations";
  const country = String(agent.country || "").trim();
  const countryClause = country ? ` from ${country}` : "";
  return `Professional headshot of an African industrial company team member named ${name}${countryClause}, role ${role} at Exportunity, an AI-managed industrial supply, sourcing, export, and manufacturing platform. Clean studio lighting, modern Afro-industrial business aesthetic, confident and approachable, deep navy workwear or professional attire with restrained gold accents, neutral background, high detail, photorealistic, 1:1. Do not add text, logos, uniforms from other companies, or financial-trading imagery.`;
}

function presetPrompt(key: StylePresetKey, agent: AgentPhotoBundle["agent"]) {
  const base = defaultPrompt(agent);
  if (key === "corporate") return base;
  if (key === "afrofuturistic") {
    return `${base} Afro-modern industrial technology aesthetic, subtle engineering environment cues, premium and cinematic but realistic, tasteful.`;
  }
  if (key === "minimal") {
    return `Minimal professional avatar icon of an African corporate team member named ${agent.name}, role ${agent.role}. Clean flat design, modern UI icon style, high contrast, neutral background, 1:1.`;
  }
  if (key === "illustrated") {
    return `Premium illustrated headshot of an African industrial company team member named ${agent.name}, role ${agent.role} at Exportunity. Clean editorial illustration, friendly and confident, deep navy, white and restrained gold-orange palette, neutral background, 1:1. No text or third-party logos.`;
  }
  return base;
}

function resolveImageUrl(url: string | null | undefined) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return resolveApiUrl(url);
  return url;
}

export function AgentPhotoEditorCard({ agentId, className }: { agentId: number; className?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const queryKey = useMemo(() => [`/api/agents/${agentId}/photo`] as const, [agentId]);
  const { data, isLoading } = useQuery<AgentPhotoBundle>({
    queryKey,
    queryFn: () => apiRequest(`/api/agents/${agentId}/photo`, { method: "GET" }),
  });

  const agent = data?.agent;
  const initialPrompt = useMemo(() => {
    if (!agent) return "";
    return String(agent.photoPrompt || "").trim() || defaultPrompt(agent);
  }, [agent]);

  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<StylePresetKey>("corporate");
  const [seed, setSeed] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [previewShape, setPreviewShape] = useState<"circle" | "square">("circle");

  useEffect(() => {
    if (!agent) return;
    setPrompt(initialPrompt);
  }, [agentId, initialPrompt, agent]);

  const lockMutation = useMutation({
    mutationFn: async (locked: boolean) =>
      apiRequest(`/api/agents/${agentId}/photo/lock`, { method: "POST", body: JSON.stringify({ locked }) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast({ title: "Saved", description: "Photo lock updated." });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed to update lock", variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiRequest(`/api/agents/${agentId}/photo/upload`, { method: "POST", body: form });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast({ title: "Uploaded", description: "Agent photo updated." });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Upload failed", variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const n = 4;
      const payload: any = { prompt, aspect_ratio: aspectRatio, n };
      const seedNumber = seed.trim() ? Number(seed.trim()) : null;
      if (seedNumber != null && Number.isFinite(seedNumber)) payload.seed = Math.trunc(seedNumber);
      return apiRequest(`/api/agents/${agentId}/photo/generate`, { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast({ title: "Generated", description: "New variants are ready." });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Generation failed", variant: "destructive" }),
  });

  const selectMutation = useMutation({
    mutationFn: async (imageId: string) =>
      apiRequest(`/api/agents/${agentId}/photo/select`, { method: "POST", body: JSON.stringify({ imageId }) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast({ title: "Updated", description: "Agent photo set." });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Select failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (imageId: string) =>
      apiRequest(`/api/agents/${agentId}/photo/variant/${encodeURIComponent(imageId)}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast({ title: "Deleted", description: "Variant removed." });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Delete failed", variant: "destructive" }),
  });

  const busy =
    isLoading ||
    lockMutation.isPending ||
    uploadMutation.isPending ||
    generateMutation.isPending ||
    selectMutation.isPending ||
    deleteMutation.isPending;

  const activeUrl = resolveImageUrl(data?.activeImage?.storedUrl || null);
  const fallbackUrl =
    agent?.id != null
      ? getAgentAvatarUrl({ id: agent.id, name: agent.name, label: agent.name, size: 256 })
      : null;

  const previewUrl = activeUrl || fallbackUrl;
  const locked = Boolean(agent?.photoLocked);
  const variants = data?.variants || [];
  const failedVariantCount = variants.filter((image) => image.status === "failed").length;
  const visibleVariants = variants.filter((image) => image.status !== "failed").slice(0, 8);

  return (
    <Card className={cn("border-border bg-card text-card-foreground", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Agent Photo</CardTitle>
        <CardDescription>
          Upload or generate a professional headshot. Variants are saved for reuse.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div className="w-full shrink-0 sm:w-24">
            <div
              className={cn(
                "h-24 w-24 overflow-hidden border border-border bg-muted",
                previewShape === "circle" ? "rounded-full" : "rounded-md",
              )}
            >
              {previewUrl ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <img src={previewUrl} className="w-full h-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No photo</div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setPreviewShape((s) => (s === "circle" ? "square" : "circle"))}
              >
                {previewShape === "circle" ? "Circle" : "Square"}
              </Button>
              {locked ? (
                <Badge className="h-7 border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">Locked</Badge>
              ) : null}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (!file) return;
                  uploadMutation.mutate(file);
                  e.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload photo
              </Button>
              <Button
                type="button"
                className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                disabled={busy || locked}
                title={locked ? "Unlock this photo before generating a replacement" : "Generate photo variants"}
                onClick={() => generateMutation.mutate()}
              >
                Generate
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || locked}
                onClick={() => generateMutation.mutate()}
              >
                Regenerate
              </Button>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-4 rounded-md border border-border bg-muted px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium">Lock photo</div>
                <div className="text-[11px] leading-4 text-muted-foreground">When locked, the system will never automatically change this photo.</div>
              </div>
              <Switch checked={locked} onCheckedChange={(v) => lockMutation.mutate(Boolean(v))} disabled={busy} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Prompt</div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[110px] bg-background text-foreground"
              placeholder="Describe the agent headshot style..."
            />
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Style preset</div>
              <Select
                value={preset}
                onValueChange={(value: any) => {
                  const next = value as StylePresetKey;
                  setPreset(next);
                  if (agent) setPrompt(presetPrompt(next, agent));
                }}
              >
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue placeholder="Select preset" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  <SelectItem value="corporate">Corporate headshot</SelectItem>
                  <SelectItem value="afrofuturistic">Afro-modern industrial</SelectItem>
                  <SelectItem value="minimal">Minimal icon/avatar</SelectItem>
                  <SelectItem value="illustrated">Illustrated (brand style)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Aspect ratio</div>
                <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v)}>
                  <SelectTrigger className="bg-background text-foreground">
                    <SelectValue placeholder="1:1" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground">
                    <SelectItem value="1:1">1:1</SelectItem>
                    <SelectItem value="4:3">4:3</SelectItem>
                    <SelectItem value="3:4">3:4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Seed (optional)</div>
                <Input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className="bg-background text-foreground"
                  placeholder="e.g., 42"
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                Tip: click a variant below to set it as the official agent photo.
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Recent variants</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {visibleVariants.map((img) => {
              const url = resolveImageUrl(img.storedUrl || null);
              const isActive = Boolean(data?.activeImage?.id && img.id === data.activeImage.id);
              const canSelect = Boolean(url) && !["pending", "processing", "queued"].includes(img.status);
              return (
                <div
                  key={img.id}
                  className={cn(
                    "group relative overflow-hidden rounded-md border bg-muted",
                    isActive ? "border-amber-500/70" : "border-border",
                  )}
                >
                  {url ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <img src={url} className="w-full h-20 object-cover" />
                  ) : (
                    <div className="flex h-20 w-full items-center justify-center text-[11px] text-muted-foreground">
                      {img.status === "failed" ? "Failed" : "Pending"}
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-1 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 bg-amber-500 px-2 text-xs text-slate-950 hover:bg-amber-400"
                      disabled={busy || !canSelect}
                      onClick={() => selectMutation.mutate(img.id)}
                    >
                      {isActive ? "Active" : canSelect ? "Set" : "Processing"}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      disabled={busy}
                      onClick={() => deleteMutation.mutate(img.id)}
                      title="Delete variant"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {!visibleVariants.length ? (
              <div className="col-span-2 text-[11px] text-muted-foreground sm:col-span-4">
                No usable generated photos yet. Upload a headshot or generate new variants.
              </div>
            ) : null}
          </div>
          {failedVariantCount > 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
              {failedVariantCount} previous generation attempt{failedVariantCount === 1 ? "" : "s"} did not complete. Uploading a photo still works; unlock this profile before trying generation again.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
