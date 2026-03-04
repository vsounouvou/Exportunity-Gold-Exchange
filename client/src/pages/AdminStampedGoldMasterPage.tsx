import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Coins, Loader2, PackageCheck, QrCode, RefreshCw, ScanLine, ShieldCheck, Store, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getDemoModeHeaders } from "@/lib/demoMode";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";

type StampedSkuRow = {
  id: string;
  skuCode: string;
  stampedType: "COIN" | "BAR";
  weightGrams: number;
  purity: string;
  serialPrefix: string;
  hallmarkText: string;
  inStock: number;
  totalItems: number;
};

type StampedItemRow = {
  id: string;
  serialCode: string;
  status: string;
  currentLocationType: string;
  ownerEmail: string | null;
  sku: { skuCode: string; stampedType: string; weightGrams: number } | null;
  partner: { name: string } | null;
};

type PartnerJeweller = {
  id: string;
  name: string;
  phone: string | null;
  stockMode: "STOCKED" | "JUST_IN_TIME";
  isActive: boolean;
};

type ScanRow = {
  id: string;
  serialCode: string;
  scannerType: string;
  ip: string | null;
  createdAt: string;
  item: { status: string } | null;
  sku: { skuCode: string } | null;
};

type PickupScanResult = {
  valid: boolean;
  serialCode: string;
  item?: { status?: string };
  product?: { name?: string };
  order?: { orderNumber?: string };
};

function parseQueryString(location: string, key: string): string | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

export default function AdminStampedGoldMasterPage() {
  const { tenant } = useTenant();
  const { token } = useSession();
  const [location] = useLocation();
  const { toast } = useToast();
  const isBourseTenant = tenant.key === "bdo";
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
  const [skus, setSkus] = useState<StampedSkuRow[]>([]);
  const [items, setItems] = useState<StampedItemRow[]>([]);
  const [jewellers, setJewellers] = useState<PartnerJeweller[]>([]);
  const [scans, setScans] = useState<ScanRow[]>([]);

  const [itemStatus, setItemStatus] = useState("ALL");
  const [itemQuery, setItemQuery] = useState("");

  const [pickupSerial, setPickupSerial] = useState("");
  const [pickupPartnerId, setPickupPartnerId] = useState<string>("");
  const [pickupResult, setPickupResult] = useState<PickupScanResult | null>(null);
  const [pickupBusy, setPickupBusy] = useState(false);

  async function loadItems(status: string, query: string) {
    if (!headers) return;
    const params = new URLSearchParams();
    if (tenantKey) params.set("tenantKey", tenantKey);
    if (status && status !== "ALL") params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    params.set("limit", "200");
    const res = await fetch(resolveApiUrl(`/api/stamped-gold/items?${params.toString()}`), { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || "Failed to load items");
    setItems(Array.isArray(json?.items) ? json.items : []);
  }

  async function loadAll() {
    if (!headers) return;
    setLoading(true);
    setError(null);
    try {
      const params = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";
      const scansParams = new URLSearchParams();
      if (tenantKey) scansParams.set("tenantKey", tenantKey);
      scansParams.set("limit", "80");

      const [skusRes, jewellersRes, scansRes] = await Promise.all([
        fetch(resolveApiUrl(`/api/stamped-gold/skus${params}`), { headers }),
        fetch(resolveApiUrl(`/api/stamped-gold/jewellers${params}`), { headers }),
        fetch(resolveApiUrl(`/api/stamped-gold/scans?${scansParams.toString()}`), { headers }),
      ]);

      const [skusJson, jewellersJson, scansJson] = await Promise.all([
        skusRes.json(),
        jewellersRes.json(),
        scansRes.json(),
      ]);

      if (!skusRes.ok) throw new Error(skusJson?.message || "Failed to load SKUs");
      if (!jewellersRes.ok) throw new Error(jewellersJson?.message || "Failed to load jewellers");
      if (!scansRes.ok) throw new Error(scansJson?.message || "Failed to load scans");

      setSkus(Array.isArray(skusJson?.skus) ? skusJson.skus : []);
      setJewellers(Array.isArray(jewellersJson?.jewellers) ? jewellersJson.jewellers : []);
      setScans(Array.isArray(scansJson?.scans) ? scansJson.scans : []);
      await loadItems(itemStatus, itemQuery);
    } catch (err: any) {
      setError(String(err?.message || "Failed to load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey, token]);

  async function applyItemFilters() {
    if (!headers) return;
    try {
      setLoading(true);
      await loadItems(itemStatus, itemQuery);
    } catch (err: any) {
      setError(String(err?.message || "Failed to load items"));
    } finally {
      setLoading(false);
    }
  }

  async function scanPickup() {
    if (!headers) return;
    const serialCode = pickupSerial.trim().toUpperCase();
    if (!serialCode) return;
    setPickupBusy(true);
    setPickupResult(null);
    try {
      const res = await fetch(resolveApiUrl("/api/pickup/scan"), {
        method: "POST",
        headers,
        body: JSON.stringify({ serialCode, partnerJewellerId: pickupPartnerId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Scan failed");
      setPickupResult(json);
      if (!json?.valid) {
        toast({ title: "Not found", description: "No item matches this serial.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "Scan failed"), variant: "destructive" });
    } finally {
      setPickupBusy(false);
    }
  }

  async function confirmPickup() {
    if (!headers || !pickupResult?.valid) return;
    setPickupBusy(true);
    try {
      const res = await fetch(resolveApiUrl("/api/pickup/confirm"), {
        method: "POST",
        headers,
        body: JSON.stringify({ serialCode: pickupResult.serialCode, partnerJewellerId: pickupPartnerId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Confirm failed");
      toast({ title: "Delivered", description: "Item marked as delivered." });
      await loadAll();
      await scanPickup();
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "Confirm failed"), variant: "destructive" });
    } finally {
      setPickupBusy(false);
    }
  }

  if (!isBourseTenant) {
    return (
      <div className="min-h-screen bg-gray-950 p-6">
        <Card className="max-w-3xl mx-auto bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Gold Stamping</CardTitle>
            <CardDescription className="text-gray-400">
              This module is only available for Bourse de l&rsquo;Or tenant spaces.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const canConfirmPickup = pickupResult?.valid && ["SOLD", "RESERVED"].includes(String(pickupResult?.item?.status || ""));

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-300 mb-1">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-medium">Bourse de l&apos;Or — Master Menu</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Gold Stamping</h1>
          <p className="text-sm text-gray-400">
            Everything is visible on this page: SKUs, items, partner jewellers, scans, and pickup.
          </p>
        </div>
        <Button variant="outline" className="border-gray-700" onClick={loadAll} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh all
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-gray-400">SKUs</CardDescription>
            <CardTitle className="text-white text-3xl">{skus.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-gray-400">Items</CardDescription>
            <CardTitle className="text-white text-3xl">{items.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-gray-400">Partner Jewellers</CardDescription>
            <CardTitle className="text-white text-3xl">{jewellers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-gray-400">Recent Scans</CardDescription>
            <CardTitle className="text-white text-3xl">{scans.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-gray-400">Items In Stock</CardDescription>
            <CardTitle className="text-white text-3xl">
              {skus.reduce((acc, sku) => acc + Number(sku.inStock || 0), 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {error ? (
        <Card className="bg-red-950/30 border-red-900/30">
          <CardContent className="p-4 text-red-200 text-sm">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" />
            SKUs
          </CardTitle>
          <CardDescription className="text-gray-400">Stamped bars/coins catalog and mint setup.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!skus.length ? <div className="text-sm text-gray-400">No SKUs found.</div> : null}
          {skus.slice(0, 12).map((sku) => (
            <div key={sku.id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-mono text-sm text-white">{sku.skuCode}</div>
                <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">
                  {sku.stampedType} • {sku.weightGrams}g • {sku.purity}
                </Badge>
                <Badge className="bg-gray-800 text-gray-200 border border-gray-700">
                  In stock {sku.inStock}/{sku.totalItems}
                </Badge>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Serial prefix: <span className="text-gray-300">{sku.serialPrefix}</span> • Hallmark:{" "}
                <span className="text-gray-300">{sku.hallmarkText}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-amber-400" />
            Items
          </CardTitle>
          <CardDescription className="text-gray-400">Serialized stamped units with status and location.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={itemStatus} onValueChange={setItemStatus}>
                <SelectTrigger className="bg-gray-950 border-gray-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  {[
                    "ALL",
                    "IN_STOCK",
                    "RESERVED",
                    "SOLD",
                    "DELIVERED",
                    "VOID",
                    "CREATED",
                    "ASSIGNED",
                    "ENGRAVED",
                    "SEALED",
                    "CERTIFIED",
                    "IN_VAULT",
                    "READY_PICKUP",
                    "OPENED_VOID",
                  ].map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Search serial</Label>
              <div className="flex gap-2">
                <Input
                  className="bg-gray-950 border-gray-800"
                  placeholder="BDO-2026-..."
                  value={itemQuery}
                  onChange={(event) => setItemQuery(event.target.value)}
                />
                <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={applyItemFilters} disabled={loading}>
                  Apply
                </Button>
              </div>
            </div>
          </div>

          {!items.length ? <div className="text-sm text-gray-400">No items found.</div> : null}
          {items.slice(0, 20).map((item) => (
            <div key={item.id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-mono text-sm text-white break-all">{item.serialCode}</div>
                <Badge className="bg-gray-800 text-gray-200 border border-gray-700">{item.status}</Badge>
                {item.sku ? (
                  <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">
                    {item.sku.skuCode}
                  </Badge>
                ) : null}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Location: {item.currentLocationType}
                {item.partner?.name ? ` • ${item.partner.name}` : ""}
                {item.ownerEmail ? ` • Owner: ${item.ownerEmail}` : ""}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Store className="h-4 w-4 text-amber-400" />
              Partner Jewellers
            </CardTitle>
            <CardDescription className="text-gray-400">Authorized manufacturing and pickup partners.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!jewellers.length ? <div className="text-sm text-gray-400">No partner jewellers found.</div> : null}
            {jewellers.map((jeweller) => (
              <div key={jeweller.id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-white font-medium">{jeweller.name}</div>
                    <div className="text-xs text-gray-500">{jeweller.phone || "No phone"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-gray-800 text-gray-200 border border-gray-700">{jeweller.stockMode}</Badge>
                    <Badge
                      className={
                        jeweller.isActive
                          ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                          : "bg-gray-800 text-gray-400 border border-gray-700"
                      }
                    >
                      {jeweller.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <QrCode className="h-4 w-4 text-amber-400" />
              Recent Scans
            </CardTitle>
            <CardDescription className="text-gray-400">QR/serial verification activity (latest first).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!scans.length ? <div className="text-sm text-gray-400">No scans yet.</div> : null}
            {scans.slice(0, 20).map((scan) => (
              <div key={scan.id} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-mono text-sm text-white break-all">{scan.serialCode}</div>
                  <Badge className="bg-gray-800 text-gray-200 border border-gray-700">{scan.scannerType}</Badge>
                  <Badge
                    className={
                      scan.item
                        ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                        : "bg-red-500/15 text-red-200 border border-red-500/30"
                    }
                  >
                    {scan.item ? scan.item.status : "NO MATCH"}
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {scan.sku?.skuCode ? `SKU: ${scan.sku.skuCode} • ` : ""}
                  {scan.ip ? `IP: ${scan.ip} • ` : ""}
                  {new Date(scan.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Truck className="h-4 w-4 text-amber-400" />
            Pickup
          </CardTitle>
          <CardDescription className="text-gray-400">Scan serial, verify handover, and confirm delivery.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Partner jeweller (optional)</Label>
              <Select value={pickupPartnerId || "__none__"} onValueChange={(value) => setPickupPartnerId(value === "__none__" ? "" : value)}>
                <SelectTrigger className="bg-gray-950 border-gray-800">
                  <SelectValue placeholder="Select partner" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  <SelectItem value="__none__">—</SelectItem>
                  {jewellers
                    .filter((jeweller) => jeweller.isActive)
                    .map((jeweller) => (
                      <SelectItem key={jeweller.id} value={jeweller.id}>
                        {jeweller.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Serial code</Label>
              <div className="flex gap-2">
                <Input
                  className="bg-gray-950 border-gray-800 font-mono"
                  placeholder="BDO-2026-..."
                  value={pickupSerial}
                  onChange={(event) => setPickupSerial(event.target.value)}
                />
                <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={scanPickup} disabled={pickupBusy || !pickupSerial.trim()}>
                  {pickupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {pickupResult ? (
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-mono text-sm text-white break-all">{pickupResult.serialCode}</div>
                <Badge
                  className={
                    pickupResult.valid
                      ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                      : "bg-red-500/15 text-red-200 border border-red-500/30"
                  }
                >
                  {pickupResult.valid ? "VALID" : "INVALID"}
                </Badge>
                {pickupResult.item?.status ? <Badge className="bg-gray-800 text-gray-200 border border-gray-700">{pickupResult.item.status}</Badge> : null}
              </div>
              {pickupResult.valid ? (
                <div className="text-xs text-gray-500">
                  Product: {pickupResult.product?.name || "—"} • Order: {pickupResult.order?.orderNumber || "—"}
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!canConfirmPickup || pickupBusy} onClick={confirmPickup}>
                  Confirm delivered
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
