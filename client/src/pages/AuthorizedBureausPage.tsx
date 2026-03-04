import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { ShieldCheck, Search, MapPin } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { getDemoModeHeaders } from "@/lib/demoMode";
import { useSession } from "@/lib/session";

type Bureau = {
  id: number;
  legalName: string | null;
  name: string;
  country: string;
  region: string | null;
  city: string;
  licenseNumber: string | null;
  licenseStatus: string;
  services?: string[] | null;
  contactPhone?: string | null;
  email?: string | null;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function AuthorizedBureausPage() {
  const session = useSession();
  if (!session.hasRole("admin")) {
    return <Redirect to="/marketplace?mode=wholesale" />;
  }

  const [q, setQ] = useState("");

  const bureausQuery = useQuery<Bureau[]>({
    queryKey: ["/api/gold-exchange/bureaus", "CI"],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/gold-exchange/bureaus?country=CI&authorizedOnly=true"), {
        headers: getDemoModeHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const filtered = useMemo(() => {
    const list = bureausQuery.data || [];
    const nq = normalize(q.trim());
    if (!nq) return list;
    return list.filter((b) => normalize(`${b.legalName || b.name} ${b.city} ${b.region || ""} ${b.licenseNumber || ""}`).includes(nq));
  }, [bureausQuery.data, q]);

  return (
    <div className="p-4 md:p-6 text-white">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              Authorized Bureau d'Achat
            </h1>
            <p className="text-xs text-white/60">Territorial registry (Cote d'Ivoire-first). Read-only compliance reference.</p>
          </div>
        </div>

        <Card className="bg-gray-900/60 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Directory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-white/50" />
              <Input
                placeholder="Search by name, city, region, license..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="bg-black/30 border-white/10 text-white"
              />
            </div>
            <p className="text-[11px] text-white/60">
              This is reference data used to validate eligibility when creating contracts and workflows in this territory.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((b) => (
            <Card key={b.id} className="bg-gray-900/60 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{b.legalName || b.name}</p>
                    <p className="text-[11px] text-white/60 truncate">License: {b.licenseNumber || "-"}</p>
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30">
                    {String(b.licenseStatus || "authorized").toUpperCase()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-white/60">
                  <MapPin className="h-4 w-4 text-white/40" />
                  <span className="truncate">
                    {b.country} | {b.region || b.city} | {b.city}
                  </span>
                </div>
                {b.services?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {b.services.slice(0, 4).map((s) => (
                      <Badge key={`${b.id}-${s}`} variant="outline" className="border-white/15 text-white/70 text-[10px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>

        {!filtered.length && (
          <Card className="bg-gray-900/60 border-white/10">
            <CardContent className="py-6 text-sm text-white/60">No authorized bureaus found.</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
