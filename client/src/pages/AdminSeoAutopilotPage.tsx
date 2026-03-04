import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, RefreshCw, X, Zap } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

type SeoRecommendation = {
  id: number;
  actionType: string;
  targetPath: string;
  severity: number;
  confidence: number;
  status: string;
  evidence?: Record<string, unknown>;
  updatedAt: string;
};

type SeoPatch = {
  id: number;
  patchType: string;
  targetPath: string;
  featureFlag: string;
  requiresApproval: boolean;
  status: string;
  patch: Record<string, unknown>;
  updatedAt: string;
};

export default function AdminSeoAutopilotPage() {
  const { toast } = useToast();

  const recsQuery = useQuery<{ ok: boolean; env: string; items: SeoRecommendation[] }>({
    queryKey: ["seo_recommendations_proposed"],
    queryFn: async () => apiRequest("/api/admin/seo/recommendations?status=proposed&limit=250"),
    staleTime: 0,
    retry: 0,
  });

  const patchesQuery = useQuery<{ ok: boolean; env: string; items: SeoPatch[] }>({
    queryKey: ["seo_patches_proposed"],
    queryFn: async () => apiRequest("/api/admin/seo/patches?status=proposed&limit=250"),
    staleTime: 0,
    retry: 0,
  });

  const activePatchesQuery = useQuery<{ ok: boolean; env: string; items: SeoPatch[] }>({
    queryKey: ["seo_patches_applied"],
    queryFn: async () => apiRequest("/api/admin/seo/patches?status=applied&limit=250"),
    staleTime: 0,
    retry: 0,
  });

  const approveRec = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/seo/recommendations/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      recsQuery.refetch();
      toast({ title: "Recommendation approved" });
    },
    onError: (err: any) => toast({ title: "Approve failed", description: String(err?.message || err), variant: "destructive" }),
  });

  const dismissRec = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/seo/recommendations/${id}/dismiss`, { method: "POST" }),
    onSuccess: () => {
      recsQuery.refetch();
      toast({ title: "Recommendation dismissed" });
    },
    onError: (err: any) => toast({ title: "Dismiss failed", description: String(err?.message || err), variant: "destructive" }),
  });

  const applyPatch = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/seo/patches/${id}/apply`, { method: "POST" }),
    onSuccess: (data: any) => {
      toast({ title: "Patch applied", description: data?.featureFlag ? `Flag: ${data.featureFlag}` : undefined });
      patchesQuery.refetch();
      activePatchesQuery.refetch();
    },
    onError: (err: any) => toast({ title: "Apply failed", description: String(err?.message || err), variant: "destructive" }),
  });

  const rollbackPatch = useMutation({
    mutationFn: async (id: number) => apiRequest(`/api/admin/seo/patches/${id}/rollback`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Patch rolled back" });
      patchesQuery.refetch();
      activePatchesQuery.refetch();
    },
    onError: (err: any) => toast({ title: "Rollback failed", description: String(err?.message || err), variant: "destructive" }),
  });

  const recs = recsQuery.data?.items ?? [];
  const patches = patchesQuery.data?.items ?? [];
  const active = activePatchesQuery.data?.items ?? [];
  const env = recsQuery.data?.env || patchesQuery.data?.env || activePatchesQuery.data?.env || "—";

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">SEO Autopilot Queue</h1>
          <p className="text-gray-400">Versioned, feature-flagged recommendations and reversible patches.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => {
              recsQuery.refetch();
              patchesQuery.refetch();
              activePatchesQuery.refetch();
            }}
            disabled={recsQuery.isFetching || patchesQuery.isFetching || activePatchesQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(recsQuery.isFetching || patchesQuery.isFetching || activePatchesQuery.isFetching) ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-300" />
            Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-200 space-y-2">
          <div>Env: <span className="text-white">{env}</span></div>
          <div className="text-white/70">
            Safe-by-default: this autopilot only proposes technical/meta changes. Redirects, robots changes, and new indexable landing pages must be explicitly approved in a future step.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Recommendations (proposed)</CardTitle>
            <div className="text-xs text-gray-500">Generated by the SEO agent (rules-first).</div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[380px] rounded-xl border border-white/10 bg-black/20">
              <div className="p-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-white/70">Action</TableHead>
                      <TableHead className="text-white/70">Path</TableHead>
                      <TableHead className="text-white/70 text-right">Sev</TableHead>
                      <TableHead className="text-white/70 text-right">Conf</TableHead>
                      <TableHead className="text-white/70 text-right">Ops</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recs.length ? (
                      recs.slice(0, 250).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-amber-200">{r.actionType}</TableCell>
                          <TableCell className="text-white/90">{r.targetPath}</TableCell>
                          <TableCell className="text-white/90 text-right">{r.severity}</TableCell>
                          <TableCell className="text-white/90 text-right">{r.confidence}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-300 hover:text-green-200 hover:bg-white/10"
                                onClick={() => approveRec.mutate(r.id)}
                                disabled={approveRec.isPending}
                                title="Approve"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-rose-300 hover:text-rose-200 hover:bg-white/10"
                                onClick={() => dismissRec.mutate(r.id)}
                                disabled={dismissRec.isPending}
                                title="Dismiss"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-white/60">
                          No proposed recommendations.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Patches (proposed)</CardTitle>
            <div className="text-xs text-gray-500">Feature-flagged, reversible runtime SEO changes.</div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[380px] rounded-xl border border-white/10 bg-black/20">
              <div className="p-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-white/70">Type</TableHead>
                      <TableHead className="text-white/70">Path</TableHead>
                      <TableHead className="text-white/70">Preview</TableHead>
                      <TableHead className="text-white/70 text-right">Ops</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patches.length ? (
                      patches.slice(0, 250).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-amber-200">{p.patchType}</TableCell>
                          <TableCell className="text-white/90">{p.targetPath}</TableCell>
                          <TableCell className="text-white/70">
                            {typeof p.patch?.title === "string" ? (
                              <div className="truncate">title: {String(p.patch.title)}</div>
                            ) : null}
                            {typeof p.patch?.description === "string" ? (
                              <div className="truncate">desc: {String(p.patch.description)}</div>
                            ) : null}
                            {!p.patch || (!p.patch.title && !p.patch.description) ? "—" : null}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => applyPatch.mutate(p.id)}
                              disabled={applyPatch.isPending || p.requiresApproval}
                              title={p.requiresApproval ? "Requires approval" : "Apply"}
                            >
                              Apply
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-white/60">
                          No proposed patches.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Active patches</CardTitle>
          <div className="text-xs text-gray-500">Patches currently enabled via feature flags.</div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-white/70">Type</TableHead>
                  <TableHead className="text-white/70">Path</TableHead>
                  <TableHead className="text-white/70">Flag</TableHead>
                  <TableHead className="text-white/70 text-right">Ops</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.length ? (
                  active.slice(0, 250).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-amber-200">{p.patchType}</TableCell>
                      <TableCell className="text-white/90">{p.targetPath}</TableCell>
                      <TableCell className="text-white/70">{p.featureFlag}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                          onClick={() => rollbackPatch.mutate(p.id)}
                          disabled={rollbackPatch.isPending}
                        >
                          Rollback
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-white/60">
                      No active patches.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

