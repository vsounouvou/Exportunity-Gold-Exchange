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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, RefreshCw } from "lucide-react";

type AdminProduct = { id: number; name: string; status: string; price?: string; currency?: string };
type AdminCategory = { id: number; slug: string; name: string };

type PartnerJeweller = { id: string; name: string; stockMode: string; isActive: boolean };

type StampedSkuRow = {
  id: string;
  skuCode: string;
  stampedType: "COIN" | "BAR";
  weightGrams: number;
  purity: string;
  metal: string;
  brandText: string;
  serialPrefix: string;
  hallmarkText: string;
  year: number | null;
  product: AdminProduct | null;
  inStock: number;
  totalItems: number;
};

function parseQueryString(location: string, key: string): string | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

const COIN_WEIGHTS = ["1", "2", "5", "10", "20", "31"];
const BAR_WEIGHTS = ["5", "10", "20", "50", "100", "250", "500", "1000"];

export default function AdminStampedGoldSkusPage() {
  const { token } = useSession();
  const { toast } = useToast();
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
  const [skus, setSkus] = useState<StampedSkuRow[]>([]);
  const [jewellers, setJewellers] = useState<PartnerJeweller[]>([]);
  const [stampedProducts, setStampedProducts] = useState<AdminProduct[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [mintOpen, setMintOpen] = useState(false);
  const [mintSku, setMintSku] = useState<StampedSkuRow | null>(null);

  const [form, setForm] = useState({
    productId: "",
    stampedType: "BAR" as "COIN" | "BAR",
    weightGrams: "10",
    purity: "999.9",
    metal: "FINE GOLD",
    brandText: "BOURSE DE L'OR",
    serialPrefix: "BDO",
    hallmarkText: "HALLMARK",
    year: String(new Date().getUTCFullYear()),
    skuCode: "",
  });

  const [mintForm, setMintForm] = useState({
    quantity: "50",
    locationType: "VAULT" as "VAULT" | "JEWELLER_PARTNER",
    locationId: "",
  });

  async function loadAll() {
    if (!headers) return;
    setLoading(true);
    setError(null);
    try {
      const qs = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";

      const [skusRes, jewellersRes, categoriesRes] = await Promise.all([
        fetch(resolveApiUrl(`/api/stamped-gold/skus${qs}`), { headers }),
        fetch(resolveApiUrl(`/api/stamped-gold/jewellers${qs}`), { headers }),
        fetch(resolveApiUrl(`/api/admin/marketplace/categories${qs}`), { headers }),
      ]);

      const skusJson = await skusRes.json();
      const jewellersJson = await jewellersRes.json();
      const categoriesJson = await categoriesRes.json();

      if (!skusRes.ok) throw new Error(skusJson?.message || "Failed to load SKUs");
      if (!jewellersRes.ok) throw new Error(jewellersJson?.message || "Failed to load jewellers");
      if (!categoriesRes.ok) throw new Error(categoriesJson?.message || "Failed to load categories");

      const categories: AdminCategory[] = Array.isArray(categoriesJson?.categories) ? categoriesJson.categories : [];
      const stampedCategory = categories.find((c) => c.slug === "stamped");

      let products: AdminProduct[] = [];
      if (stampedCategory?.id) {
        const params = new URLSearchParams();
        if (tenantKey) params.set("tenantKey", tenantKey);
        params.set("categoryId", String(stampedCategory.id));
        params.set("limit", "200");
        const productsRes = await fetch(resolveApiUrl(`/api/admin/marketplace/products?${params.toString()}`), { headers });
        const productsJson = await productsRes.json();
        if (productsRes.ok) {
          products = Array.isArray(productsJson?.items)
            ? productsJson.items.map((it: any) => it?.product).filter((p: any) => p && typeof p.id === "number")
            : [];
        }
      }

      setSkus(Array.isArray(skusJson?.skus) ? skusJson.skus : []);
      setJewellers(Array.isArray(jewellersJson?.jewellers) ? jewellersJson.jewellers : []);
      setStampedProducts(products);
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

  const weightOptions = form.stampedType === "COIN" ? COIN_WEIGHTS : BAR_WEIGHTS;

  async function submitSku() {
    if (!headers) return;
    try {
      const body = {
        productId: Number(form.productId),
        stampedType: form.stampedType,
        weightGrams: Number(form.weightGrams),
        purity: form.purity,
        metal: form.metal,
        brandText: form.brandText,
        hallmarkText: form.hallmarkText,
        serialPrefix: form.serialPrefix,
        year: Number(form.year),
        skuCode: form.skuCode || undefined,
      };
      const qs = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";
      const res = await fetch(resolveApiUrl(`/api/stamped-gold/skus${qs}`), { method: "POST", headers, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to save SKU");
      toast({ title: "Saved", description: "Stamped Gold SKU saved." });
      setCreateOpen(false);
      await loadAll();
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "Failed to save"), variant: "destructive" });
    }
  }

  async function submitMint() {
    if (!headers || !mintSku) return;
    try {
      const body = {
        skuId: mintSku.id,
        quantity: Number(mintForm.quantity),
        locationType: mintForm.locationType,
        locationId: mintForm.locationType === "JEWELLER_PARTNER" ? mintForm.locationId : undefined,
      };
      const qs = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";
      const res = await fetch(resolveApiUrl(`/api/stamped-gold/items/mint${qs}`), { method: "POST", headers, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to mint");
      toast({ title: "Minted", description: `Minted ${json?.minted ?? 0} item(s).` });
      setMintOpen(false);
      await loadAll();
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "Failed to mint"), variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Stamped Gold SKUs</h1>
          <p className="text-sm text-gray-400">
            Coins and bars only. Each SKU enforces legal stamp fields before it can be published.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-gray-700" onClick={loadAll} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            New SKU
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="bg-red-950/30 border-red-900/30">
          <CardContent className="p-4 text-red-200 text-sm">{error}</CardContent>
        </Card>
      ) : null}

      <Card className="bg-gray-900/60 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">SKUs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : null}

          {!loading && !skus.length ? <div className="text-sm text-gray-400">No stamped gold SKUs yet.</div> : null}

          <div className="space-y-3">
            {skus.map((sku) => (
              <div key={sku.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-sm text-white">{sku.skuCode}</div>
                      <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">
                        {sku.stampedType} • {sku.weightGrams}g • {sku.purity}
                      </Badge>
                      <Badge className="bg-gray-800 text-gray-200 border border-gray-700">
                        In stock: {sku.inStock} / {sku.totalItems}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-300">{sku.product?.name || "Unlinked product"}</div>
                    <div className="text-xs text-gray-500">
                      Serial prefix: <span className="font-mono text-gray-300">{sku.serialPrefix}</span> • Hallmark:{" "}
                      <span className="text-gray-300">{sku.hallmarkText}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={sku.product?.status === "active" ? "bg-amber-500/15 text-amber-200 border border-amber-500/30" : "bg-gray-800 text-gray-300 border border-gray-700"}>
                      Product: {sku.product?.status || "—"}
                    </Badge>
                    <Button
                      variant="secondary"
                      className="bg-gray-800 hover:bg-gray-700 text-white"
                      onClick={() => {
                        setMintSku(sku);
                        setMintForm({ quantity: "50", locationType: "VAULT", locationId: "" });
                        setMintOpen(true);
                      }}
                    >
                      Mint
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create / Link a SKU</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={form.productId} onValueChange={(v) => setForm((s) => ({ ...s, productId: v }))}>
                <SelectTrigger className="bg-gray-950 border-gray-800">
                  <SelectValue placeholder="Select stamped product…" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  {stampedProducts.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} ({p.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-gray-500">Only products in category “stamped” are eligible.</div>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.stampedType}
                onValueChange={(v) => setForm((s) => ({ ...s, stampedType: v as any, weightGrams: v === "COIN" ? "10" : "50" }))}
              >
                <SelectTrigger className="bg-gray-950 border-gray-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  <SelectItem value="COIN">COIN</SelectItem>
                  <SelectItem value="BAR">BAR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Weight (grams)</Label>
              <Select value={form.weightGrams} onValueChange={(v) => setForm((s) => ({ ...s, weightGrams: v }))}>
                <SelectTrigger className="bg-gray-950 border-gray-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  {weightOptions.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}g
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Purity</Label>
              <Input className="bg-gray-950 border-gray-800" value={form.purity} onChange={(e) => setForm((s) => ({ ...s, purity: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Hallmark text (required)</Label>
              <Input
                className="bg-gray-950 border-gray-800"
                value={form.hallmarkText}
                onChange={(e) => setForm((s) => ({ ...s, hallmarkText: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Serial prefix (required)</Label>
              <Input
                className="bg-gray-950 border-gray-800"
                value={form.serialPrefix}
                onChange={(e) => setForm((s) => ({ ...s, serialPrefix: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Brand</Label>
              <Input
                className="bg-gray-950 border-gray-800"
                value={form.brandText}
                onChange={(e) => setForm((s) => ({ ...s, brandText: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Metal</Label>
              <Input className="bg-gray-950 border-gray-800" value={form.metal} onChange={(e) => setForm((s) => ({ ...s, metal: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Year</Label>
              <Input className="bg-gray-950 border-gray-800" value={form.year} onChange={(e) => setForm((s) => ({ ...s, year: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>SKU Code (optional override)</Label>
              <Input className="bg-gray-950 border-gray-800" value={form.skuCode} onChange={(e) => setForm((s) => ({ ...s, skuCode: e.target.value }))} />
            </div>
          </div>
          <Separator className="bg-gray-800" />
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-gray-300" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitSku} className="bg-amber-600 hover:bg-amber-700 text-white" disabled={!form.productId}>
              Save SKU
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mintOpen} onOpenChange={setMintOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle>Mint items</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-gray-300">
              SKU: <span className="font-mono text-white">{mintSku?.skuCode || "—"}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input className="bg-gray-950 border-gray-800" value={mintForm.quantity} onChange={(e) => setMintForm((s) => ({ ...s, quantity: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={mintForm.locationType} onValueChange={(v) => setMintForm((s) => ({ ...s, locationType: v as any }))}>
                  <SelectTrigger className="bg-gray-950 border-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="VAULT">VAULT</SelectItem>
                    <SelectItem value="JEWELLER_PARTNER">JEWELLER_PARTNER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mintForm.locationType === "JEWELLER_PARTNER" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label>Partner jeweller</Label>
                  <Select value={mintForm.locationId} onValueChange={(v) => setMintForm((s) => ({ ...s, locationId: v }))}>
                    <SelectTrigger className="bg-gray-950 border-gray-800">
                      <SelectValue placeholder="Select partner…" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-800">
                      {jewellers
                        .filter((j) => j.isActive)
                        .map((j) => (
                          <SelectItem key={j.id} value={j.id}>
                            {j.name} ({j.stockMode})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-gray-300" onClick={() => setMintOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitMint}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={mintForm.locationType === "JEWELLER_PARTNER" && !mintForm.locationId}
            >
              Mint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
