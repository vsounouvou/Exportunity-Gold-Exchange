import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Badge,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getDemoModeHeaders } from "@/lib/demoMode";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";
import { Coins, Copy, Download, Loader2, QrCode, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

type StampedSkuRow = {
  id: string;
  skuCode: string;
  stampedType: "COIN" | "BAR";
  productType?: string | null;
  weightGrams: number;
  purity: string;
  karat?: number | null;
  brandText: string;
  hallmarkText: string;
  name?: string | null;
  product?: { id: number; name: string | null } | null;
  designCode?: string | null;
  editionType?: string | null;
  originCountry?: string | null;
  originMine?: string | null;
  traceabilityEnabled?: boolean | null;
  qrEnabled?: boolean | null;
  serialEnabled?: boolean | null;
  personalizationEnabled?: boolean | null;
  vaultEligible?: boolean | null;
  jewelryConversionEligible?: boolean | null;
  imageTemplateMode?: string | null;
  previewDefaults?: Record<string, any> | null;
};

function parseQueryString(location: string, key: string): string | null {
  const qs = location.split("?")[1] || "";
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const raw = params.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

function todayLabel() {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
}

function defaultSerialForSku(sku: StampedSkuRow | null) {
  if (!sku) return "";
  return `${sku.skuCode}-${new Date().getUTCFullYear()}-001`;
}

function previewTemplateForSku(sku: StampedSkuRow | null) {
  return sku?.stampedType === "COIN"
    ? "/tenants/bdo/minting-template-coin.svg"
    : "/tenants/bdo/minting-template-ingot.svg";
}

export default function AdminStampedGoldMintingStudioPage() {
  const { tenant } = useTenant();
  const { token } = useSession();
  const { toast } = useToast();
  const [location] = useLocation();
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
  const [skus, setSkus] = useState<StampedSkuRow[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string>("");
  const [ownerName, setOwnerName] = useState("Vital Sounouvou");
  const [dateText, setDateText] = useState(todayLabel());
  const [serialText, setSerialText] = useState("");
  const [editionLabel, setEditionLabel] = useState("Édition Héritage");
  const [designPreset, setDesignPreset] = useState("Institutional");
  const [line1, setLine1] = useState("BOURSE DE L'OR");
  const [line2, setLine2] = useState("OR AFRICAIN CERTIFIÉ");
  const [line3, setLine3] = useState("TRACE • COFFRE • CERTIFICAT");
  const [engraverNotes, setEngraverNotes] = useState("Gravure nette, centrée, finition premium.");
  const [qrEnabled, setQrEnabled] = useState(true);
  const [serialEnabled, setSerialEnabled] = useState(true);
  const [vaultEligible, setVaultEligible] = useState(true);
  const [jewelryConversionEligible, setJewelryConversionEligible] = useState(false);
  const [personalizationEnabled, setPersonalizationEnabled] = useState(true);

  const selectedSku = useMemo(
    () => skus.find((sku) => sku.id === selectedSkuId) || skus[0] || null,
    [selectedSkuId, skus],
  );

  useEffect(() => {
    if (!selectedSku) return;
    setSelectedSkuId(selectedSku.id);
    setSerialText((prev) => prev || defaultSerialForSku(selectedSku));
    setEditionLabel(selectedSku.editionType || "Édition Héritage");
    setDesignPreset(selectedSku.designCode || "Institutional");
    setLine1(selectedSku.brandText || "BOURSE DE L'OR");
    setLine2(`${selectedSku.weightGrams}g • ${selectedSku.karat || 18}K • ${selectedSku.purity}`);
    setLine3(selectedSku.originCountry || "CÔTE D'IVOIRE");
    setQrEnabled(selectedSku.qrEnabled ?? true);
    setSerialEnabled(selectedSku.serialEnabled ?? true);
    setVaultEligible(selectedSku.vaultEligible ?? true);
    setJewelryConversionEligible(selectedSku.jewelryConversionEligible ?? false);
    setPersonalizationEnabled(selectedSku.personalizationEnabled ?? true);
  }, [selectedSku]);

  useEffect(() => {
    async function loadSkus() {
      if (!headers) return;
      setLoading(true);
      try {
        const qs = tenantKey ? `?tenantKey=${encodeURIComponent(tenantKey)}` : "";
        const res = await fetch(resolveApiUrl(`/api/stamped-gold/skus${qs}`), { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message || "Failed to load stamped gold SKUs");
        const nextSkus = Array.isArray(json?.skus) ? json.skus : [];
        setSkus(nextSkus);
        if (nextSkus[0]?.id) setSelectedSkuId((current) => current || nextSkus[0].id);
      } catch (error: any) {
        toast({
          title: "Erreur",
          description: String(error?.message || "Impossible de charger les SKUs."),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    loadSkus();
  }, [headers, tenantKey, toast]);

  const workshopLines = useMemo(() => {
    if (!selectedSku) return [];
    return [
      `Support: ${selectedSku.stampedType === "COIN" ? "Pièce collector" : "Lingot"}`,
      `SKU: ${selectedSku.skuCode}`,
      `Poids: ${selectedSku.weightGrams} g`,
      `Carat: ${selectedSku.karat || 18}K`,
      `Pureté: ${selectedSku.purity}`,
      `Édition: ${editionLabel}`,
      `Design: ${designPreset}`,
      `Nom du propriétaire: ${ownerName || "—"}`,
      `Date: ${dateText || "—"}`,
      `Série: ${serialEnabled ? serialText || "à générer" : "désactivée"}`,
      `QR: ${qrEnabled ? "actif" : "inactif"}`,
      `Coffre: ${vaultEligible ? "éligible" : "non éligible"}`,
      `Transformation bijou: ${jewelryConversionEligible ? "oui" : "non"}`,
      `Personnalisation: ${personalizationEnabled ? "autorisée" : "désactivée"}`,
    ];
  }, [
    dateText,
    designPreset,
    editionLabel,
    jewelryConversionEligible,
    ownerName,
    personalizationEnabled,
    qrEnabled,
    selectedSku,
    serialEnabled,
    serialText,
    vaultEligible,
  ]);

  const previewModeLabel =
    selectedSku?.stampedType === "COIN" ? "Preview pièce collector" : "Preview lingot";

  async function copyWorkshopSheet() {
    const payload = [...workshopLines, "", "Notes atelier:", engraverNotes || "—", "", line1, line2, line3].join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      toast({ title: "Copié", description: "La fiche atelier a été copiée." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier la fiche atelier.", variant: "destructive" });
    }
  }

  function printPreview() {
    window.print();
  }

  if (!isBourseTenant) {
    return (
      <div className="min-h-screen bg-gray-950 p-6">
        <Card className="max-w-3xl mx-auto bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Atelier de frappe</CardTitle>
            <CardDescription className="text-gray-400">
              Cet atelier est réservé au tenant Bourse de l&apos;Or.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-amber-300 mb-1">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm font-medium">Bourse de l&apos;Or — Atelier de frappe</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Prévisualisation lingots & pièces</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-400">
            Préparez les instructions d&apos;engraving, la traçabilité, la personnalisation et le rendu atelier
            avant émission du certificat ou transfert au coffre.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-gray-700" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Recharger
          </Button>
          <Button variant="outline" className="border-gray-700" onClick={copyWorkshopSheet}>
            <Copy className="h-4 w-4 mr-2" />
            Copier la fiche
          </Button>
          <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={printPreview}>
            <Download className="h-4 w-4 mr-2" />
            Imprimer
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="bg-gray-900/70 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Spécification de frappe</CardTitle>
            <CardDescription className="text-gray-400">
              Sélection du support, des lignes à graver et des options d&apos;atelier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des SKUs…
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-gray-400">SKU</Label>
              <Select value={selectedSkuId} onValueChange={setSelectedSkuId}>
                <SelectTrigger className="bg-black/30 border-white/10 text-white">
                  <SelectValue placeholder="Choisir un SKU" />
                </SelectTrigger>
                <SelectContent>
                  {skus.map((sku) => (
                    <SelectItem key={sku.id} value={sku.id}>
                      {sku.skuCode} • {sku.weightGrams}g • {sku.stampedType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Édition</Label>
                <Input value={editionLabel} onChange={(e) => setEditionLabel(e.target.value)} className="bg-black/30 border-white/10 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Design</Label>
                <Input value={designPreset} onChange={(e) => setDesignPreset(e.target.value)} className="bg-black/30 border-white/10 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Propriétaire</Label>
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="bg-black/30 border-white/10 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Date</Label>
                <Input value={dateText} onChange={(e) => setDateText(e.target.value)} className="bg-black/30 border-white/10 text-white" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs uppercase tracking-wider text-gray-400">Série / numéro</Label>
                <Input value={serialText} onChange={(e) => setSerialText(e.target.value)} className="bg-black/30 border-white/10 text-white" />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-gray-400">Lignes gravées</Label>
              <Input value={line1} onChange={(e) => setLine1(e.target.value)} className="bg-black/30 border-white/10 text-white" />
              <Input value={line2} onChange={(e) => setLine2(e.target.value)} className="bg-black/30 border-white/10 text-white" />
              <Input value={line3} onChange={(e) => setLine3(e.target.value)} className="bg-black/30 border-white/10 text-white" />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div>
                  <p className="text-sm text-white">QR</p>
                  <p className="text-[11px] text-white/50">Zone de vérification</p>
                </div>
                <Switch checked={qrEnabled} onCheckedChange={setQrEnabled} />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div>
                  <p className="text-sm text-white">Numéro de série</p>
                  <p className="text-[11px] text-white/50">Traçabilité atelier</p>
                </div>
                <Switch checked={serialEnabled} onCheckedChange={setSerialEnabled} />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div>
                  <p className="text-sm text-white">Coffre</p>
                  <p className="text-[11px] text-white/50">Disponible dans le coffre</p>
                </div>
                <Switch checked={vaultEligible} onCheckedChange={setVaultEligible} />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div>
                  <p className="text-sm text-white">Transformer en bijou</p>
                  <p className="text-[11px] text-white/50">Éligibilité partenaire</p>
                </div>
                <Switch checked={jewelryConversionEligible} onCheckedChange={setJewelryConversionEligible} />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2 md:col-span-2">
                <div>
                  <p className="text-sm text-white">Personnalisation</p>
                  <p className="text-[11px] text-white/50">Nom, date, message, gravure spéciale</p>
                </div>
                <Switch checked={personalizationEnabled} onCheckedChange={setPersonalizationEnabled} />
              </label>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-gray-400">Notes atelier</Label>
              <Textarea
                value={engraverNotes}
                onChange={(e) => setEngraverNotes(e.target.value)}
                className="min-h-[112px] bg-black/30 border-white/10 text-white"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-gray-900/70 border-gray-800 overflow-hidden">
            <CardHeader className="border-b border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-white">{previewModeLabel}</CardTitle>
                  <CardDescription className="text-gray-400">
                    Template neutre avec superposition dynamique des champs atelier.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/30">
                    {selectedSku?.weightGrams || "—"} g
                  </Badge>
                  <Badge className="bg-gray-800 text-gray-200 border-gray-700">
                    {selectedSku?.karat || 18}K
                  </Badge>
                  <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30">
                    {selectedSku?.stampedType === "COIN" ? "Pièce" : "Lingot"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-[28px] border border-white/10 bg-black/35 p-4">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] bg-[#0f0f11]">
                    <img
                      src={previewTemplateForSku(selectedSku)}
                      alt="Template de frappe"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-8">
                      <div className="relative w-full max-w-[620px] text-center text-[#1d1205]">
                        <div className="space-y-2 drop-shadow-[0_2px_4px_rgba(255,245,211,0.35)]">
                          <p className="text-xs font-semibold tracking-[0.34em] uppercase">{line1}</p>
                          <p className="text-2xl font-semibold uppercase tracking-[0.1em]">{line2}</p>
                          <p className="text-sm uppercase tracking-[0.24em]">{line3}</p>
                        </div>
                        <div className="mt-10 grid gap-3 text-xs font-medium uppercase tracking-[0.22em] sm:grid-cols-3">
                          <div>
                            <div className="opacity-60">Édition</div>
                            <div className="mt-1 text-sm tracking-[0.08em]">{editionLabel}</div>
                          </div>
                          <div>
                            <div className="opacity-60">Propriétaire</div>
                            <div className="mt-1 text-sm tracking-[0.08em]">{ownerName || "—"}</div>
                          </div>
                          <div>
                            <div className="opacity-60">Date</div>
                            <div className="mt-1 text-sm tracking-[0.08em]">{dateText || "—"}</div>
                          </div>
                        </div>
                        <div className="mt-10 flex items-end justify-between text-[11px] uppercase tracking-[0.24em]">
                          <div className="text-left">
                            <div className="opacity-55">Série</div>
                            <div className="mt-1 text-sm tracking-[0.08em]">{serialEnabled ? serialText || "À générer" : "Désactivée"}</div>
                          </div>
                          {qrEnabled ? (
                            <div className="rounded-2xl border border-[#5f431e]/20 bg-white/20 px-4 py-3 text-center">
                              <QrCode className="mx-auto h-10 w-10" />
                              <div className="mt-2 text-[10px]">Zone QR</div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <Card className="bg-black/25 border-white/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-white text-base">Résumé produit</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-white/80">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-white/50">Produit</span>
                        <span className="text-right">{selectedSku?.product?.name || selectedSku?.name || "SKU sans produit lié"}</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-white/50">Origine</span>
                        <span className="text-right">{selectedSku?.originCountry || "Côte d’Ivoire"}{selectedSku?.originMine ? ` • ${selectedSku.originMine}` : ""}</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-white/50">Traceabilité</span>
                        <span>{selectedSku?.traceabilityEnabled ?? true ? "Active" : "Inactive"}</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-white/50">Mode</span>
                        <span>{selectedSku?.imageTemplateMode || "ingot_blank"}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-black/25 border-white/10">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-white text-base">Signaux atelier</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30">
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                        Certificat
                      </Badge>
                      {vaultEligible ? (
                        <Badge className="bg-sky-500/15 text-sky-200 border-sky-500/30">Disponible dans le coffre</Badge>
                      ) : null}
                      {personalizationEnabled ? (
                        <Badge className="bg-violet-500/15 text-violet-200 border-violet-500/30">
                          <Sparkles className="mr-1 h-3.5 w-3.5" />
                          Personnalisation
                        </Badge>
                      ) : null}
                      {jewelryConversionEligible ? (
                        <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/30">Transformer en bijou</Badge>
                      ) : null}
                      <Badge className="bg-gray-800 text-gray-200 border-gray-700">
                        <Coins className="mr-1 h-3.5 w-3.5" />
                        {selectedSku?.stampedType === "COIN" ? "Pièce collector" : "Lingot d’investissement"}
                      </Badge>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/70 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Fiche atelier</CardTitle>
              <CardDescription className="text-gray-400">
                Instructions directement exploitables par l’atelier, l’affinage ou le partenaire joaillier.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="space-y-2 text-sm text-white/80">
                  {workshopLines.map((line) => (
                    <div key={line} className="flex items-start gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-amber-400" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
                  <p className="font-medium text-white">Notes atelier</p>
                  <p className="mt-2 whitespace-pre-wrap">{engraverNotes || "Aucune note."}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/80">
                <p className="font-medium text-white">Sortie attendue</p>
                <ul className="mt-3 space-y-2">
                  <li>• Gravure centrée, lisible et premium</li>
                  <li>• Série et QR compatibles certificat / vérification</li>
                  <li>• Rendu prêt pour coffre, livraison ou transformation</li>
                  <li>• Support atelier réutilisable pour lingots et pièces</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
