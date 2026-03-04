import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

type ScanRow = {
  id: string;
  serialCode: string;
  scannerType: string;
  scannedByUserId: string | null;
  ip: string | null;
  createdAt: string;
  item: { id: string; status: string } | null;
  sku: { id: string; skuCode: string; stampedType: string; weightGrams: number } | null;
};

function parseQueryString(location: string, key: string): string | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

export default function AdminStampedGoldScansPage() {
  const { token } = useSession();
  const [location] = useLocation();

  const tenantKey = useMemo(() => parseQueryString(location, "tenantKey") || "", [location]);
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : undefined),
    [token],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    if (!headers) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tenantKey) params.set("tenantKey", tenantKey);
      if (q.trim()) params.set("q", q.trim());
      params.set("limit", "200");
      const res = await fetch(`/api/stamped-gold/scans?${params.toString()}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to load scans");
      setScans(Array.isArray(json?.scans) ? json.scans : []);
    } catch (err: any) {
      setError(String(err?.message || "Failed to load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey, token]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Verification scans</h1>
          <p className="text-sm text-gray-400">Every QR scan is logged for trust and fraud detection.</p>
        </div>
        <Button variant="outline" className="border-gray-700" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      <Card className="bg-gray-900/60 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Serial contains</Label>
          <div className="flex gap-2">
            <Input className="bg-gray-950 border-gray-800" value={q} onChange={(e) => setQ(e.target.value)} placeholder="BDO-…" />
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={load}>
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="bg-red-950/30 border-red-900/30">
          <CardContent className="p-4 text-red-200 text-sm">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="bg-gray-900/60 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Recent scans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : null}
          {!loading && !scans.length ? <div className="text-sm text-gray-400">No scans yet.</div> : null}

          <div className="space-y-2">
            {scans.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-sm text-white break-all">{s.serialCode}</div>
                      <Badge className="bg-gray-800 text-gray-200 border border-gray-700">{s.scannerType}</Badge>
                      {s.item ? (
                        <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">{s.item.status}</Badge>
                      ) : (
                        <Badge className="bg-red-500/15 text-red-200 border border-red-500/30">NO MATCH</Badge>
                      )}
                    </div>
                    {s.sku ? <div className="text-xs text-gray-500">SKU: {s.sku.skuCode}</div> : null}
                    <div className="text-xs text-gray-500">
                      {s.ip ? `IP: ${s.ip}` : "IP: —"} • {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {s.scannedByUserId ? <div>User: {s.scannedByUserId}</div> : <div>User: —</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

