import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/lib/session";
import { getDemoModeHeaders } from "@/lib/demoMode";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";

type StampedItemRow = {
  id: string;
  serialCode: string;
  status: string;
  currentLocationType: string;
  mintedAt: string;
  soldAt: string | null;
  deliveredAt: string | null;
  orderId: number | null;
  ownerEmail: string | null;
  sku: { id: string; skuCode: string; stampedType: string; weightGrams: number } | null;
  product: { id: number; name: string } | null;
  partner: { id: string; name: string } | null;
};

function parseQueryString(location: string, key: string): string | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

export default function AdminStampedGoldItemsPage() {
  const { token } = useSession();
  const [location] = useLocation();

  const tenantKey = useMemo(() => parseQueryString(location, "tenantKey") || "", [location]);
  const headers = useMemo(() => {
    if (!token) return undefined;
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...getDemoModeHeaders(),
    };
  }, [token]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StampedItemRow[]>([]);

  const [status, setStatus] = useState<string>("ALL");
  const [q, setQ] = useState("");

  async function load() {
    if (!headers) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tenantKey) params.set("tenantKey", tenantKey);
      if (status && status !== "ALL") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      params.set("limit", "200");

      const res = await fetch(resolveApiUrl(`/api/stamped-gold/items?${params.toString()}`), { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to load items");
      setItems(Array.isArray(json?.items) ? json.items : []);
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
          <h1 className="text-2xl font-bold text-white">Stamped Gold Items</h1>
          <p className="text-sm text-gray-400">Serialized physical units (each has a unique serial and QR verification link).</p>
        </div>
        <Button variant="outline" className="border-gray-700" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      <Card className="bg-gray-900/60 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-gray-950 border-gray-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                {["ALL", "IN_STOCK", "RESERVED", "SOLD", "DELIVERED", "VOID"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Search serial</Label>
            <div className="flex gap-2">
              <Input className="bg-gray-950 border-gray-800" value={q} onChange={(e) => setQ(e.target.value)} placeholder="BDO-2026-…" />
              <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={load}>
                Apply
              </Button>
            </div>
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
          <CardTitle className="text-white">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : null}
          {!loading && !items.length ? <div className="text-sm text-gray-400">No items found.</div> : null}

          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-sm text-white break-all">{it.serialCode}</div>
                      <Badge className="bg-gray-800 text-gray-200 border border-gray-700">{it.status}</Badge>
                      {it.sku ? (
                        <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">
                          {it.sku.skuCode}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-300">{it.product?.name || "—"}</div>
                    <div className="text-xs text-gray-500">
                      Location: {it.currentLocationType}
                      {it.partner?.name ? ` • ${it.partner.name}` : ""}
                      {it.orderId ? ` • Order #${it.orderId}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {it.ownerEmail ? <div>Owner: {it.ownerEmail}</div> : null}
                    {it.soldAt ? <div>Sold: {new Date(it.soldAt).toLocaleString()}</div> : null}
                    {it.deliveredAt ? <div>Delivered: {new Date(it.deliveredAt).toLocaleString()}</div> : null}
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
