import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, RefreshCw } from "lucide-react";

type PartnerJeweller = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  stockMode: "STOCKED" | "JUST_IN_TIME";
  isActive: boolean;
};

function parseQueryString(location: string, key: string): string | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

export default function AdminStampedGoldJewellersPage() {
  const { token } = useSession();
  const { toast } = useToast();
  const [location] = useLocation();

  const tenantKey = useMemo(() => parseQueryString(location, "tenantKey") || "", [location]);
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : undefined),
    [token],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jewellers, setJewellers] = useState<PartnerJeweller[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    stockMode: "JUST_IN_TIME" as "STOCKED" | "JUST_IN_TIME",
    isActive: true,
  });

  async function load() {
    if (!headers) return;
    setLoading(true);
    setError(null);
    try {
      const qs = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";
      const res = await fetch(`/api/stamped-gold/jewellers${qs}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to load jewellers");
      setJewellers(Array.isArray(json?.jewellers) ? json.jewellers : []);
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

  async function submit() {
    if (!headers) return;
    try {
      const qs = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";
      const res = await fetch(`/api/stamped-gold/jewellers${qs}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: form.name,
          address: form.address || undefined,
          phone: form.phone || undefined,
          stockMode: form.stockMode,
          isActive: form.isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Failed to create");
      toast({ title: "Created", description: "Partner jeweller created." });
      setCreateOpen(false);
      setForm({ name: "", address: "", phone: "", stockMode: "JUST_IN_TIME", isActive: true });
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: String(err?.message || "Failed"), variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Partner Jewellers</h1>
          <p className="text-sm text-gray-400">Pickup partners for stamped gold orders (stocked or just-in-time).</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-gray-700" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add
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
          <CardTitle className="text-white">Jewellers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : null}
          {!loading && !jewellers.length ? <div className="text-sm text-gray-400">No partners yet.</div> : null}
          <div className="space-y-2">
            {jewellers.map((j) => (
              <div key={j.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-white font-medium">{j.name}</div>
                    <div className="text-xs text-gray-500">{j.address || "—"}</div>
                    <div className="text-xs text-gray-500">{j.phone || "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-gray-800 text-gray-200 border border-gray-700">{j.stockMode}</Badge>
                    <Badge className={j.isActive ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" : "bg-gray-800 text-gray-400 border border-gray-700"}>
                      {j.isActive ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-xl">
          <DialogHeader>
            <DialogTitle>Add partner jeweller</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input className="bg-gray-950 border-gray-800" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input className="bg-gray-950 border-gray-800" value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input className="bg-gray-950 border-gray-800" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stock mode</Label>
                <Select value={form.stockMode} onValueChange={(v) => setForm((s) => ({ ...s, stockMode: v as any }))}>
                  <SelectTrigger className="bg-gray-950 border-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="STOCKED">STOCKED</SelectItem>
                    <SelectItem value="JUST_IN_TIME">JUST_IN_TIME</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.isActive ? "ACTIVE" : "INACTIVE"} onValueChange={(v) => setForm((s) => ({ ...s, isActive: v === "ACTIVE" }))}>
                  <SelectTrigger className="bg-gray-950 border-gray-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                    <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-gray-300" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={submit} disabled={!form.name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

