import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type ContractRow = {
  id: string;
  contractType: string;
  contractStatus: string;
  paymentStatus: string;
  escrowStatus: string;
  depositAmount: string;
  clientUserId?: number | null;
  ownerUserId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

function b(label: string) {
  const v = String(label || "").toLowerCase();
  if (v === "active") return "bg-emerald-500/20 text-emerald-200 border-emerald-500/30";
  if (v === "pending") return "bg-amber-500/20 text-amber-200 border-amber-500/30";
  if (v === "completed") return "bg-sky-500/20 text-sky-200 border-sky-500/30";
  if (v === "cancelled") return "bg-zinc-500/20 text-zinc-200 border-zinc-500/30";
  if (v === "defaulted") return "bg-rose-500/20 text-rose-200 border-rose-500/30";
  if (v === "holding") return "bg-purple-500/20 text-purple-200 border-purple-500/30";
  if (v === "released") return "bg-emerald-500/20 text-emerald-200 border-emerald-500/30";
  return "bg-white/10 text-white border-white/10";
}

export default function AdminEquipmentOpsContractsPage() {
  const query = useQuery<{ contracts: ContractRow[] }>({
    queryKey: ["/api/equipment-contracts?limit=200&offset=0"],
    queryFn: async () => apiRequest("/api/equipment-contracts?limit=200&offset=0"),
  });

  const rows = query.data?.contracts || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Equipment Contracts</h1>
          <p className="text-gray-400">Escrow status, overdue returns, disputes (phase 2).</p>
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
          <CardTitle className="text-white text-lg">Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/60">Contract</TableHead>
                  <TableHead className="text-white/60">Status</TableHead>
                  <TableHead className="text-white/60">Payment</TableHead>
                  <TableHead className="text-white/60">Escrow</TableHead>
                  <TableHead className="text-white/60">Deposit</TableHead>
                  <TableHead className="text-white/60">Owner / Client</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="border-white/10">
                    <TableCell className="text-sm text-white">
                      <div className="font-medium">{row.contractType}</div>
                      <div className="text-xs text-white/50">{row.id.slice(0, 8)}…</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] px-2 py-1 ${b(row.contractStatus)}`}>{row.contractStatus}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-white/70">{row.paymentStatus}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] px-2 py-1 ${b(row.escrowStatus)}`}>{row.escrowStatus}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-amber-300 font-semibold">{row.depositAmount}</TableCell>
                    <TableCell className="text-xs text-white/70">
                      {row.ownerUserId || "—"} / {row.clientUserId || "—"}
                    </TableCell>
                  </TableRow>
                ))}

                {!rows.length && !query.isFetching ? (
                  <TableRow className="border-white/10">
                    <TableCell colSpan={6} className="text-sm text-white/60 py-8 text-center">
                      No contracts found.
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

