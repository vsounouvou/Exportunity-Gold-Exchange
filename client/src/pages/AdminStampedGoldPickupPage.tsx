import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ScanLine } from "lucide-react";

type PartnerJeweller = { id: string; name: string; stockMode: string; isActive: boolean };

type PickupScanResult = {
  valid: boolean;
  serialCode: string;
  item?: any;
  sku?: any;
  product?: any;
  order?: any;
  certificate?: any;
};

function parseQueryString(location: string, key: string): string | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

export default function AdminStampedGoldPickupPage() {
  const { token } = useSession();
  const { toast } = useToast();
  const [location] = useLocation();

  const tenantKey = useMemo(() => parseQueryString(location, "tenantKey") || "", [location]);
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : undefined),
    [token],
  );

  const [loading, setLoading] = useState(false);
  const [jewellers, setJewellers] = useState<PartnerJeweller[]>([]);
  const [partnerId, setPartnerId] = useState<string>("");
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState<PickupScanResult | null>(null);

  useEffect(() => {
    if (!headers) return;
    const qs = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";
    fetch(`/api/stamped-gold/jewellers${qs}`, { headers })
      .then((r) => r.json())
      .then((j) => setJewellers(Array.isArray(j?.jewellers) ? j.jewellers : []))
      .catch(() => setJewellers([]));
  }, [headers, tenantKey]);

  async function scan() {
    if (!headers) return;
    const serialCode = serial.trim().toUpperCase();
    if (!serialCode) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/pickup/scan`, {
        method: "POST",
        headers,
        body: JSON.stringify({ serialCode, partnerJewellerId: partnerId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Scan failed");
      setResult(json);
      if (!json?.valid) toast({ title: "Not found", description: "No item matches this serial.", variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "Scan failed"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!headers || !result?.valid) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pickup/confirm`, {
        method: "POST",
        headers,
        body: JSON.stringify({ serialCode: result.serialCode, partnerJewellerId: partnerId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Confirm failed");
      toast({ title: "Delivered", description: "Item marked as delivered." });
      await scan();
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "Confirm failed"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const itemStatus = String(result?.item?.status || "");
  const canConfirm = result?.valid && (itemStatus === "SOLD" || itemStatus === "RESERVED");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Jeweller pickup</h1>
        <p className="text-sm text-gray-400">Scan / verify a stamped gold serial and confirm handover.</p>
      </div>

      <Card className="bg-gray-900/60 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Partner jeweller (optional)</Label>
              <Select value={partnerId || "__none__"} onValueChange={(v) => setPartnerId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="bg-gray-950 border-gray-800">
                  <SelectValue placeholder="Select partner…" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  <SelectItem value="__none__">—</SelectItem>
                  {jewellers
                    .filter((j) => j.isActive)
                    .map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Serial code</Label>
              <div className="flex gap-2">
                <Input className="bg-gray-950 border-gray-800 font-mono" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="BDO-2026-…" />
                <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={scan} disabled={loading || !serial.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {result ? (
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm text-white break-all">{result.serialCode}</div>
                <Badge className={result.valid ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" : "bg-red-500/15 text-red-200 border border-red-500/30"}>
                  {result.valid ? "VALID" : "INVALID"}
                </Badge>
                {result.item?.status ? <Badge className="bg-gray-800 text-gray-200 border border-gray-700">{result.item.status}</Badge> : null}
              </div>

              {result.valid ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="text-gray-300">
                    <div className="text-gray-500 text-xs">Product</div>
                    <div className="text-white font-medium">{result.product?.name || "—"}</div>
                  </div>
                  <div className="text-gray-300">
                    <div className="text-gray-500 text-xs">Order</div>
                    <div className="text-white font-medium">{result.order?.orderNumber || "—"}</div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" className="border-gray-700" onClick={() => setResult(null)} disabled={loading}>
                  Clear
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={confirm} disabled={loading || !canConfirm}>
                  Confirm delivered
                </Button>
              </div>
              {!canConfirm && result.valid ? (
                <div className="text-xs text-gray-500">Confirm is available only when item status is SOLD/RESERVED.</div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
