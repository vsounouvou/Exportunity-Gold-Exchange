import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, BarChart3 } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

type TelemetrySummary = {
  ok: boolean;
  env: string;
  range: { days: number; since: string };
  totals: { sessions: number; pageViews: number; errors: number; botSessions: number };
  topPages: Array<{ path: string; views: number }>;
};

type RecentSession = {
  id: number;
  sessionId: string;
  entryPath: string | null;
  exitPath: string | null;
  lastSeenAt: string;
  pageViews: number;
  errors: number;
  deviceClass: string | null;
  isBot: boolean;
};

export default function AdminVisitsIntelligencePage() {
  const [days, setDays] = useState(7);

  const summaryQuery = useQuery<TelemetrySummary>({
    queryKey: ["telemetry_summary", days],
    queryFn: async () => apiRequest(`/api/admin/telemetry/summary?days=${days}`),
    staleTime: 30_000,
    retry: 0,
  });

  const sessionsQuery = useQuery<{ ok: boolean; env: string; items: RecentSession[] }>({
    queryKey: ["telemetry_recent_sessions"],
    queryFn: async () => apiRequest("/api/admin/telemetry/sessions/recent?limit=60"),
    staleTime: 30_000,
    retry: 0,
  });

  const summary = summaryQuery.data;
  const topPages = summary?.topPages ?? [];
  const recentSessions = sessionsQuery.data?.items ?? [];

  const lastUpdated = useMemo(() => {
    const since = summary?.range?.since ? new Date(summary.range.since) : null;
    if (!since || Number.isNaN(since.getTime())) return null;
    return since.toLocaleString();
  }, [summary?.range?.since]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Visits Intelligence</h1>
          <p className="text-gray-400">Tenant-aware telemetry, sessions, and journey signals (privacy-safe).</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {[1, 7, 30].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "secondary" : "outline"}
                className={days === d ? "" : "border-white/15 bg-white/5 text-white hover:bg-white/10"}
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={() => {
              summaryQuery.refetch();
              sessionsQuery.refetch();
            }}
            disabled={summaryQuery.isFetching || sessionsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(summaryQuery.isFetching || sessionsQuery.isFetching) ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-300" />
              Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-white">{summary?.totals?.sessions ?? "—"}</CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Page views</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-white">{summary?.totals?.pageViews ?? "—"}</CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Errors</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-white">{summary?.totals?.errors ?? "—"}</CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Bot sessions</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-white">{summary?.totals?.botSessions ?? "—"}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Top pages</CardTitle>
            <div className="text-xs text-gray-500">
              Range: last {days} day(s) • Env: <span className="text-white/80">{summary?.env ?? "—"}</span>
              {lastUpdated ? <> • Since: <span className="text-white/80">{lastUpdated}</span></> : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-white/70">Path</TableHead>
                    <TableHead className="text-white/70 text-right">Views</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPages.length ? (
                    topPages.map((row) => (
                      <TableRow key={row.path}>
                        <TableCell className="text-white/90">{row.path}</TableCell>
                        <TableCell className="text-white/90 text-right">{row.views}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} className="text-white/60">
                        No telemetry yet (wait for traffic).
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Recent sessions</CardTitle>
            <div className="text-xs text-gray-500">Latest observed sessions (human + bots).</div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[340px] rounded-xl border border-white/10 bg-black/20">
              <div className="p-3">
                <div className="rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-white/70">Entry</TableHead>
                        <TableHead className="text-white/70">Last</TableHead>
                        <TableHead className="text-white/70 text-right">Views</TableHead>
                        <TableHead className="text-white/70 text-right">Err</TableHead>
                        <TableHead className="text-white/70">Device</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentSessions.length ? (
                        recentSessions.map((s) => (
                          <TableRow key={s.sessionId}>
                            <TableCell className="text-white/90">{s.entryPath || "—"}</TableCell>
                            <TableCell className="text-white/70">{new Date(s.lastSeenAt).toLocaleString()}</TableCell>
                            <TableCell className="text-white/90 text-right">{s.pageViews ?? 0}</TableCell>
                            <TableCell className="text-white/90 text-right">{s.errors ?? 0}</TableCell>
                            <TableCell className="text-white/60">
                              {s.isBot ? "bot" : s.deviceClass || "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-white/60">
                            No sessions yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

