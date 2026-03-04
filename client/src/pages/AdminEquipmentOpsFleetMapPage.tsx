import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type EquipmentRow = {
  id: string;
  category: string;
  make?: string | null;
  model?: string | null;
  condition: string;
  currentStatus: string;
  currentLocationLat?: string | null;
  currentLocationLng?: string | null;
  updatedAt?: string;
};

function statusBadge(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "available") return { label: "Available", className: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30" };
  if (s === "reserved") return { label: "Reserved", className: "bg-amber-500/20 text-amber-200 border-amber-500/30" };
  if (s === "deployed") return { label: "Deployed", className: "bg-sky-500/20 text-sky-200 border-sky-500/30" };
  if (s === "in_maintenance") return { label: "Maintenance", className: "bg-purple-500/20 text-purple-200 border-purple-500/30" };
  if (s === "unavailable") return { label: "Unavailable", className: "bg-zinc-500/20 text-zinc-200 border-zinc-500/30" };
  if (s === "sold") return { label: "Sold", className: "bg-rose-500/20 text-rose-200 border-rose-500/30" };
  return { label: status || "Unknown", className: "bg-white/10 text-white border-white/10" };
}

export default function AdminEquipmentOpsFleetMapPage() {
  const query = useQuery<{ equipment: EquipmentRow[] }>({
    queryKey: ["/api/equipment?limit=200&offset=0"],
    queryFn: async () => apiRequest("/api/equipment?limit=200&offset=0"),
  });

  const rows = query.data?.equipment || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Equipment Ops</h1>
          <p className="text-gray-400">Fleet map (phase 1: list + last known GPS).</p>
        </div>
        <Button
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Fleet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Equipment</TableHead>
                  <TableHead className="text-white/60">Condition</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60">GPS</TableHead>
                  <TableHead className="text-white/60">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const badge = statusBadge(row.currentStatus);
                  const gps = row.currentLocationLat && row.currentLocationLng ? `${row.currentLocationLat}, ${row.currentLocationLng}` : "—";
                  return (
                    <TableRow key={row.id} className="border-white/10">
                      <TableCell className="text-sm text-white">
                        <div className="font-medium">{row.category}</div>
                        <div className="text-xs text-white/50">{[row.make, row.model].filter(Boolean).join(" ")}</div>
                      </TableCell>
                      <TableCell className="text-xs text-white/70">{row.condition}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-2 py-1 ${badge.className}`}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-white/70">{gps}</TableCell>
                      <TableCell className="text-xs text-white/60">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  );
                })}

                {!rows.length && !query.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={5} className="text-sm text-white/60 py-8 text-center">
                      No equipment found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

