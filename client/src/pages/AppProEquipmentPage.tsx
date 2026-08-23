import { useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";

import { AppProBottomNav } from "@/components/agentic/AppProBottomNav";
import { AppProTopBar } from "@/components/agentic/AppProTopBar";
import { ProSideNav } from "@/components/agentic/ProSideNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

function parseTabFromLocation(location: string) {
  const idx = location.indexOf("?");
  if (idx === -1) return null;
  try {
    const params = new URLSearchParams(location.slice(idx + 1));
    const tab = String(params.get("tab") || "").trim().toLowerCase();
    return tab || null;
  } catch {
    return null;
  }
}

type EquipmentRow = {
  id: string;
  category: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  condition: string;
  currentStatus: string;
  updatedAt?: string;
};

type ListingRow = {
  id: string;
  equipmentId: string;
  listingType: string;
  title: string;
  status: string;
  visibility: string;
  depositAmount: string;
  priceDay?: string | null;
  priceSale?: string | null;
  updatedAt?: string;
  equipment?: EquipmentRow | null;
};

type ContractRow = {
  id: string;
  contractType: string;
  equipmentId: string;
  listingId?: string | null;
  clientUserId?: number | null;
  ownerUserId?: number | null;
  contractStatus: string;
  paymentStatus: string;
  escrowStatus: string;
  depositAmount: string;
  updatedAt?: string;
};

function fmtMoney(value: string | null | undefined) {
  const n = Number(value ?? "");
  if (!Number.isFinite(n)) return value || "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

export default function AppProEquipmentPage() {
  const session = useSession();
  const { toast } = useToast();
  const [location] = useLocation();
  const initialTab = (() => {
    const tab = parseTabFromLocation(location);
    if (tab === "equipment" || tab === "listings" || tab === "contracts") return tab;
    return "equipment";
  })();

  const [equipDialogOpen, setEquipDialogOpen] = useState(false);
  const [listingDialogOpen, setListingDialogOpen] = useState(false);

  const [newEquip, setNewEquip] = useState({
    category: "",
    make: "",
    model: "",
    condition: "used",
  });

  const [newListing, setNewListing] = useState({
    equipmentId: "",
    listingType: "rent",
    title: "",
    priceDay: "",
    priceSale: "",
    depositAmount: "0",
    visibility: "public",
  });

  const { data: equipmentData, isLoading: loadingEquipment } = useQuery<{ equipment: EquipmentRow[] }>({
    queryKey: ["/api/equipment?limit=200&offset=0"],
    enabled: session.isAuthenticated && !session.isGuest,
    staleTime: 10_000,
  });

  const equipmentRows = equipmentData?.equipment || [];

  const { data: listingsData, isLoading: loadingListings } = useQuery<{ listings: ListingRow[] }>({
    queryKey: ["/api/equipment-listings?status=all&visibility=all&limit=200&offset=0"],
    enabled: session.isAuthenticated && !session.isGuest,
    staleTime: 10_000,
  });

  const listingRows = listingsData?.listings || [];

  const { data: contractsData, isLoading: loadingContracts } = useQuery<{ contracts: ContractRow[] }>({
    queryKey: ["/api/equipment-contracts?limit=200&offset=0"],
    enabled: session.isAuthenticated && !session.isGuest,
    staleTime: 10_000,
  });

  const contractRows = contractsData?.contracts || [];

  const createEquipment = useMutation({
    mutationFn: async () => {
      const payload = {
        category: newEquip.category.trim(),
        make: newEquip.make.trim() || null,
        model: newEquip.model.trim() || null,
        condition: newEquip.condition,
      };
      if (!payload.category) throw new Error("Category is required");
      return apiRequest("/api/equipment", "POST", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment?limit=200&offset=0"] });
      setEquipDialogOpen(false);
      setNewEquip({ category: "", make: "", model: "", condition: "used" });
      toast({ title: "Equipment added" });
    },
  });

  const createListing = useMutation({
    mutationFn: async () => {
      const payload: any = {
        equipmentId: newListing.equipmentId,
        listingType: newListing.listingType,
        title: newListing.title.trim(),
        depositAmount: newListing.depositAmount || "0",
        visibility: newListing.visibility,
        status: "draft",
      };
      if (newListing.priceDay.trim()) payload.priceDay = newListing.priceDay.trim();
      if (newListing.priceSale.trim()) payload.priceSale = newListing.priceSale.trim();
      if (!payload.equipmentId) throw new Error("Select an equipment");
      if (!payload.title) throw new Error("Title is required");
      return apiRequest("/api/equipment-listings", "POST", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-listings?status=all&visibility=all&limit=200&offset=0"] });
      setListingDialogOpen(false);
      setNewListing({
        equipmentId: "",
        listingType: "rent",
        title: "",
        priceDay: "",
        priceSale: "",
        depositAmount: "0",
        visibility: "public",
      });
      toast({ title: "Listing created" });
    },
  });

  const publishListing = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/equipment-listings/${encodeURIComponent(id)}/publish`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-listings?status=all&visibility=all&limit=200&offset=0"] });
      toast({ title: "Listing published" });
    },
  });

  const pauseListing = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/equipment-listings/${encodeURIComponent(id)}/pause`, "POST", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-listings?status=all&visibility=all&limit=200&offset=0"] });
      toast({ title: "Listing paused" });
    },
  });

  const holdEscrow = useMutation({
    mutationFn: async (contractId: string) => apiRequest("/api/payments/escrow/hold", "POST", { contractId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-contracts?limit=200&offset=0"] });
      toast({ title: "Deposit held in escrow" });
    },
  });

  const releaseEscrow = useMutation({
    mutationFn: async (contractId: string) => apiRequest("/api/payments/escrow/release", "POST", { contractId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-contracts?limit=200&offset=0"] });
      toast({ title: "Deposit released" });
    },
  });

  if (!session.isAuthenticated || session.isGuest) {
    return <Redirect to={`/pro/login?next=${encodeURIComponent(location)}`} />;
  }

  const userId = (session.user as any)?.id as number | undefined;

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24 text-slate-950">
      <ProSideNav activeKey="operations" />
      <div className="md:ml-56">
      <AppProTopBar subtitle="Equipment" />
      <div className="px-4 py-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Equipment</h1>
            <p className="mt-1 text-xs text-slate-600">List, publish, and manage rental or sale contracts.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100" onClick={() => setEquipDialogOpen(true)}>
              Add equipment
            </Button>
            <Button className="bg-[#F5A623] font-semibold text-[#07111F] hover:bg-[#F8C45B]" onClick={() => setListingDialogOpen(true)}>
              Create listing
            </Button>
          </div>
        </div>

        <Tabs defaultValue={initialTab} className="mt-6">
          <TabsList className="border border-slate-200 bg-white">
            <TabsTrigger value="equipment">My Equipment</TabsTrigger>
            <TabsTrigger value="listings">Listings</TabsTrigger>
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
          </TabsList>

          <TabsContent value="equipment" className="mt-4">
            {loadingEquipment ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : equipmentRows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                No equipment yet. Add your first machine.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {equipmentRows.map((row) => (
                  <Card key={row.id} className="border-slate-200 bg-white shadow-sm">
                    <CardContent className="p-4 space-y-2">
                      <div className="text-sm font-semibold text-slate-950">{row.category}</div>
                      <div className="text-xs text-slate-600">
                        {[row.make, row.model].filter(Boolean).join(" ")}{" "}
                        {row.year ? <span className="text-slate-400">· {row.year}</span> : null}
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">{row.condition}</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">{row.currentStatus}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="listings" className="mt-4">
            {loadingListings ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : listingRows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">No listings yet.</div>
            ) : (
              <div className="space-y-2">
                {listingRows.map((row) => (
                  <Card key={row.id} className="border-slate-200 bg-white shadow-sm">
                    <CardContent className="p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold truncate">{row.title}</div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                            {row.listingType}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                            {row.status}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                            {row.visibility}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          Deposit: {fmtMoney(row.depositAmount)} ·{" "}
                          {row.priceDay ? `Day: ${fmtMoney(row.priceDay)}` : row.priceSale ? `Sale: ${fmtMoney(row.priceSale)}` : "Pricing TBD"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {row.status !== "published" ? (
                          <Button
                            size="sm"
                            className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
                            onClick={() => publishListing.mutate(row.id)}
                            disabled={publishListing.isPending}
                          >
                            Publish
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-300 text-slate-700 hover:bg-slate-100"
                            onClick={() => pauseListing.mutate(row.id)}
                            disabled={pauseListing.isPending}
                          >
                            Pause
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="contracts" className="mt-4">
            {loadingContracts ? (
              <div className="text-sm text-slate-600">Loading…</div>
            ) : contractRows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">No contracts yet.</div>
            ) : (
              <div className="space-y-2">
                {contractRows.map((row) => {
                  const canHold = userId != null && row.clientUserId === userId && row.escrowStatus !== "holding";
                  const canRelease = userId != null && row.ownerUserId === userId && row.escrowStatus === "holding";
                  return (
                    <Card key={row.id} className="border-slate-200 bg-white shadow-sm">
                      <CardContent className="p-4 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">Contract · {row.contractType}</div>
                          <div className="mt-1 text-xs text-slate-600">
                            Status: {row.contractStatus} · Escrow: {row.escrowStatus} · Deposit: {fmtMoney(row.depositAmount)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {canHold ? (
                            <Button
                              size="sm"
                              className="bg-sky-600 font-semibold text-white hover:bg-sky-700"
                              onClick={() => holdEscrow.mutate(row.id)}
                              disabled={holdEscrow.isPending}
                            >
                              Hold deposit
                            </Button>
                          ) : null}
                          {canRelease ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-300 text-slate-700 hover:bg-slate-100"
                              onClick={() => releaseEscrow.mutate(row.id)}
                              disabled={releaseEscrow.isPending}
                            >
                              Release deposit
                            </Button>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={equipDialogOpen} onOpenChange={setEquipDialogOpen}>
        <DialogContent className="border-slate-200 bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>Add equipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Input
                value={newEquip.category}
                onChange={(e) => setNewEquip((p) => ({ ...p, category: e.target.value }))}
                placeholder="Excavator / Trommel / Generator…"
                className="border-slate-200 bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Make</Label>
                <Input value={newEquip.make} onChange={(e) => setNewEquip((p) => ({ ...p, make: e.target.value }))} className="border-slate-200 bg-white" />
              </div>
              <div className="space-y-1">
                <Label>Model</Label>
                <Input value={newEquip.model} onChange={(e) => setNewEquip((p) => ({ ...p, model: e.target.value }))} className="border-slate-200 bg-white" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Condition</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-700"
                value={newEquip.condition}
                onChange={(e) => setNewEquip((p) => ({ ...p, condition: e.target.value }))}
              >
                <option value="new">New</option>
                <option value="refurbished">Refurbished</option>
                <option value="used">Used</option>
                <option value="broken">Broken</option>
              </select>
            </div>
            <Button
              className="w-full bg-[#F5A623] font-semibold text-[#07111F] hover:bg-[#F8C45B]"
              onClick={() => createEquipment.mutate()}
              disabled={createEquipment.isPending}
            >
              {createEquipment.isPending ? "Saving…" : "Save"}
            </Button>
            {createEquipment.error ? (
              <div className="text-sm text-rose-700">{String((createEquipment.error as any)?.message || "Error")}</div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={listingDialogOpen} onOpenChange={setListingDialogOpen}>
        <DialogContent className="border-slate-200 bg-white text-slate-950">
          <DialogHeader>
            <DialogTitle>Create listing</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Equipment</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-700"
                value={newListing.equipmentId}
                onChange={(e) => setNewListing((p) => ({ ...p, equipmentId: e.target.value }))}
              >
                <option value="">Select…</option>
                {equipmentRows.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.category} {e.make ? `· ${e.make}` : ""} {e.model ? e.model : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-700"
                  value={newListing.listingType}
                  onChange={(e) => setNewListing((p) => ({ ...p, listingType: e.target.value }))}
                >
                  <option value="rent">Rent</option>
                  <option value="sale">Sale</option>
                  <option value="fix_and_rent">Fix & Rent</option>
                  <option value="rent_to_own">Rent-to-own</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Visibility</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-slate-700"
                  value={newListing.visibility}
                  onChange={(e) => setNewListing((p) => ({ ...p, visibility: e.target.value }))}
                >
                  <option value="public">Public</option>
                  <option value="pro_only">Pro only</option>
                  <option value="territory_only">Territory only</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={newListing.title}
                onChange={(e) => setNewListing((p) => ({ ...p, title: e.target.value }))}
                placeholder="22T excavator (tracked) — refurbished"
                className="border-slate-200 bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Price/day</Label>
                <Input value={newListing.priceDay} onChange={(e) => setNewListing((p) => ({ ...p, priceDay: e.target.value }))} className="border-slate-200 bg-white" />
              </div>
              <div className="space-y-1">
                <Label>Price (sale)</Label>
                <Input value={newListing.priceSale} onChange={(e) => setNewListing((p) => ({ ...p, priceSale: e.target.value }))} className="border-slate-200 bg-white" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Deposit</Label>
              <Input
                value={newListing.depositAmount}
                onChange={(e) => setNewListing((p) => ({ ...p, depositAmount: e.target.value }))}
                className="border-slate-200 bg-white"
              />
            </div>
            <Button
              className="w-full bg-[#F5A623] font-semibold text-[#07111F] hover:bg-[#F8C45B]"
              onClick={() => createListing.mutate()}
              disabled={createListing.isPending}
            >
              {createListing.isPending ? "Saving…" : "Save draft"}
            </Button>
            {createListing.error ? (
              <div className="text-sm text-rose-700">{String((createListing.error as any)?.message || "Error")}</div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      </div>
      <AppProBottomNav activeKey="operations" />
      </div>
    </div>
  );
}
