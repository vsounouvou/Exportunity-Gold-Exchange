import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Search, Store } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PublicSeller = {
  sellerUserId: string;
  displayName: string;
  country?: string | null;
  primaryTerritoryId?: number | null;
};

export default function SellerDirectoryPage() {
  const [query, setQuery] = useState("");

  const listQuery = useQuery<{ ok: boolean; sellers: PublicSeller[] }>({
    queryKey: ["public_sellers"],
    queryFn: async () => apiRequest("/api/public/sellers"),
    staleTime: 30_000,
    retry: 1,
  });

  const sellers = useMemo(() => {
    const all = listQuery.data?.sellers || [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((s) => String(s.displayName || "").toLowerCase().includes(q));
  }, [listQuery.data?.sellers, query]);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Trouver un vendeur</h1>
            <p className="text-xs text-white/60 mt-1">Vendeurs habilités à faire des dépôts wallet (QR).</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <Store className="h-5 w-5 text-white/70" />
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un vendeur..."
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/40"
          />
        </div>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Vendeurs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {listQuery.isLoading ? (
              <div className="text-sm text-white/60">Chargement...</div>
            ) : listQuery.isError ? (
              <div className="text-sm text-rose-300">Impossible de charger la liste.</div>
            ) : sellers.length === 0 ? (
              <div className="text-sm text-white/60">Aucun vendeur trouvé.</div>
            ) : (
              sellers.slice(0, 50).map((s) => (
                <div
                  key={s.sellerUserId}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{s.displayName}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate">
                        {(s.country || "").trim() ? s.country : "—"}
                        {s.primaryTerritoryId ? ` • Territoire ${s.primaryTerritoryId}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] text-white/50">ID {s.sellerUserId}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

