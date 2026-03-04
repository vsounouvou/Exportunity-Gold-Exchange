import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type ListingRow = {
  id: string;
  listingType: string;
  title: string;
  status: string;
  visibility: string;
  depositAmount: string;
  priceDay?: string | null;
  priceSale?: string | null;
  equipment?: { id: string; category: string; make?: string | null; model?: string | null } | null;
  owner?: { id: number; displayName: string } | null;
  updatedAt?: string;
};

function badge(label: string) {
  const v = String(label || "").toLowerCase();
  if (v === "published") return "bg-emerald-500/20 text-emerald-200 border-emerald-500/30";
  if (v === "draft") return "bg-white/5 text-white border-white/10";
  if (v === "paused") return "bg-amber-500/20 text-amber-200 border-amber-500/30";
  if (v === "closed") return "bg-zinc-500/20 text-zinc-200 border-zinc-500/30";
  if (v === "public") return "bg-sky-500/20 text-sky-200 border-sky-500/30";
  if (v === "pro_only") return "bg-purple-500/20 text-purple-200 border-purple-500/30";
  if (v === "territory_only") return "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/30";
  return "bg-white/10 text-white border-white/10";
}

export default function AdminEquipmentOpsListingsPage() {
  const query = useQuery<{ listings: ListingRow[] }>({
    queryKey: ["/api/equipment-listings?status=all&visibility=all&limit=200&offset=0"],
    queryFn: async () => apiRequest("/api/equipment-listings?status=all&visibility=all&limit=200&offset=0"),
  });

  const rows = query.data?.listings || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Equipment Listings</h1>
          <p className="text-gray-400">Approve/flag flows come next (phase 2).</p>
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
          <CardTitle className="text-white text-lg">Listings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Listing</TableHead>
                  <TableHead className="text-white/60">Type</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60">Visibility</TableHead>
                  <TableHead className="text-white/60">Deposit</TableHead>
                  <TableHead className="text-white/60">Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="border-white/10">
                    <TableCell className="text-sm text-white">
                      <div className="font-medium">{row.title}</div>
                      <div className="text-xs text-white/50">
                        {row.equipment?.category || "—"} {row.equipment?.make || ""} {row.equipment?.model || ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-white/70">{row.listingType}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] px-2 py-1 ${badge(row.status)}`}>{row.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] px-2 py-1 ${badge(row.visibility)}`}>{row.visibility}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-amber-300 font-semibold">{row.depositAmount}</TableCell>
                    <TableCell className="text-xs text-white/70">{row.owner?.displayName || row.owner?.id || "—"}</TableCell>
                  </TableRow>
                ))}

                {!rows.length && !query.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={6} className="text-sm text-white/60 py-8 text-center">
                      No listings found.
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

