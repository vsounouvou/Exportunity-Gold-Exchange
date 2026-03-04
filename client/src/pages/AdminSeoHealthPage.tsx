import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw, Search, Play } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

type SeoIssue = {
  id: number;
  path: string;
  issueType: string;
  severity: number;
  message: string;
  status: string;
  lastSeenAt: string;
};

type SeoSnapshot = {
  id: number;
  path: string;
  statusCode: number;
  title: string | null;
  canonical: string | null;
  collectedAt: string;
};

export default function AdminSeoHealthPage() {
  const { toast } = useToast();

  const issuesQuery = useQuery<{ ok: boolean; env: string; items: SeoIssue[] }>({
    queryKey: ["seo_issues_open"],
    queryFn: async () => apiRequest("/api/admin/seo/issues?status=open&limit=250"),
    staleTime: 0,
    retry: 0,
  });

  const snapshotsQuery = useQuery<{ ok: boolean; env: string; items: SeoSnapshot[] }>({
    queryKey: ["seo_snapshots_recent"],
    queryFn: async () => apiRequest("/api/admin/seo/snapshots?limit=200"),
    staleTime: 0,
    retry: 0,
  });

  const scanMutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/seo/scan", { method: "POST", body: JSON.stringify({ maxPages: 60 }) }),
    onSuccess: (data: any) => {
      toast({
        title: "SEO scan complete",
        description: `Pages: ${data?.pages ?? "?"} • Issues: ${data?.issues ?? "?"}`,
      });
      issuesQuery.refetch();
      snapshotsQuery.refetch();
    },
    onError: (err: any) => {
      toast({ title: "SEO scan failed", description: String(err?.message || err), variant: "destructive" });
    },
  });

  const issues = issuesQuery.data?.items ?? [];
  const snapshots = snapshotsQuery.data?.items ?? [];

  const lastScanAt = useMemo(() => {
    const ts = snapshots[0]?.collectedAt;
    if (!ts) return null;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString();
  }, [snapshots]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">SEO Health</h1>
          <p className="text-gray-400">Nightly/hourly snapshots, technical issues, and tenant-aware canonicals.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => {
              issuesQuery.refetch();
              snapshotsQuery.refetch();
            }}
            disabled={issuesQuery.isFetching || snapshotsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(issuesQuery.isFetching || snapshotsQuery.isFetching) ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            <Play className={`h-4 w-4 mr-2 ${scanMutation.isPending ? "animate-pulse" : ""}`} />
            Run scan
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Search className="h-4 w-4 text-amber-300" />
              Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-200 space-y-2">
            <div>
              Env: <span className="text-white">{issuesQuery.data?.env ?? snapshotsQuery.data?.env ?? "—"}</span>
            </div>
            <div>
              Open issues: <span className="text-white font-semibold">{issues.length}</span>
            </div>
            <div>
              Recent snapshots: <span className="text-white font-semibold">{snapshots.length}</span>
            </div>
            <div>
              Last scan: <span className="text-white">{lastScanAt ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Open issues</CardTitle>
            <div className="text-xs text-gray-500">Actionable technical SEO findings (tenant-scoped).</div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px] rounded-xl border border-white/10 bg-black/20">
              <div className="p-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-white/70">Severity</TableHead>
                      <TableHead className="text-white/70">Type</TableHead>
                      <TableHead className="text-white/70">Path</TableHead>
                      <TableHead className="text-white/70">Message</TableHead>
                      <TableHead className="text-white/70">Last seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issues.length ? (
                      issues.slice(0, 200).map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="text-white/90">{i.severity}</TableCell>
                          <TableCell className="text-amber-200">{i.issueType}</TableCell>
                          <TableCell className="text-white/90">{i.path}</TableCell>
                          <TableCell className="text-white/70">{i.message}</TableCell>
                          <TableCell className="text-white/60">{new Date(i.lastSeenAt).toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-white/60">
                          No open issues.
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
          <CardTitle className="text-white text-lg">Recent snapshots</CardTitle>
          <div className="text-xs text-gray-500">Latest crawl results used by the autopilot.</div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-white/70">Path</TableHead>
                  <TableHead className="text-white/70 text-right">HTTP</TableHead>
                  <TableHead className="text-white/70">Title</TableHead>
                  <TableHead className="text-white/70">Canonical</TableHead>
                  <TableHead className="text-white/70">Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.length ? (
                  snapshots.slice(0, 200).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-white/90">{s.path}</TableCell>
                      <TableCell className="text-white/90 text-right">{s.statusCode}</TableCell>
                      <TableCell className="text-white/70">{s.title || "—"}</TableCell>
                      <TableCell className="text-white/60">{s.canonical || "—"}</TableCell>
                      <TableCell className="text-white/60">{new Date(s.collectedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-white/60">
                      No snapshots yet. Run a scan.
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

