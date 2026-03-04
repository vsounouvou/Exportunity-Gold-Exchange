import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";

type VerifyPayload = {
  valid: boolean;
  serialCode?: string;
  status?: string;
  sku?: {
    skuCode: string;
    type: "COIN" | "BAR";
    weightGrams: number;
    purity: string;
    metal: string;
    brandText: string;
    hallmarkText: string;
    year: number | null;
    requiresLegalStamp: boolean;
  } | null;
  product?: { id: number; name: string; status: string } | null;
  location?: { type: string; partnerId: string | null } | null;
  order?: { orderNumber: string; status: string; paidAt: string | null; deliveredAt: string | null; pickupPartnerId: string | null } | null;
  owner?: { name: string | null; email: string | null; phone: string | null } | null;
  message?: string;
};

function formatWeight(weightGrams: number) {
  if (!Number.isFinite(weightGrams)) return "";
  if (weightGrams >= 1000 && weightGrams % 1000 === 0) return `${weightGrams / 1000}kg`;
  return `${weightGrams}g`;
}

export default function StampedGoldVerifyPage() {
  const [, params] = useRoute("/verify/:serial");
  const serial = useMemo(() => String(params?.serial || "").trim().toUpperCase(), [params?.serial]);

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<VerifyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setPayload(null);
      try {
        const res = await fetch(`/api/stamped-gold/verify/${encodeURIComponent(serial)}`, { method: "GET" });
        const data = (await res.json()) as VerifyPayload;
        if (cancelled) return;
        setPayload(data);
        if (!res.ok && data?.valid !== false) setError(data?.message || "Verification failed");
      } catch (err: any) {
        if (cancelled) return;
        setError(String(err?.message || "Verification failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (serial) run();
    else {
      setLoading(false);
      setPayload({ valid: false, serialCode: "", status: "INVALID" });
    }
    return () => {
      cancelled = true;
    };
  }, [serial]);

  const isValid = Boolean(payload?.valid);
  const status = String(payload?.status || "").toUpperCase();
  const isVoid = status === "VOID";

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isValid && !isVoid ? (
                <ShieldCheck className="h-6 w-6 text-emerald-400" />
              ) : (
                <ShieldX className="h-6 w-6 text-red-400" />
              )}
              <h1 className="text-2xl font-semibold text-white">Verification</h1>
            </div>
            <Badge
              className={
                isValid && !isVoid
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  : "bg-red-500/15 text-red-300 border border-red-500/30"
              }
            >
              {isValid && !isVoid ? "Valid" : "Invalid"}
            </Badge>
          </div>
          <p className="text-sm text-white/60">
            This is the official Bourse de l&rsquo;Or verification page. It confirms whether a stamped gold item serial is valid and its current status.
          </p>
        </div>

        <Card className="bg-gray-900/60 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Serial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-sm text-white/90 break-all">{serial || "—"}</div>
              <Button
                variant="secondary"
                className="bg-gray-800 hover:bg-gray-700 text-white"
                onClick={() => navigator.clipboard?.writeText(serial)}
                disabled={!serial}
              >
                Copy
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-white/60" /> : null}
              {loading ? <span className="text-sm text-white/60">Checking…</span> : null}
              {error ? <span className="text-sm text-red-300">{error}</span> : null}
              {!loading && payload && !error ? (
                <span className="text-sm text-white/60">Status: {payload.valid ? payload.status : "INVALID"}</span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {!loading && payload ? (
          <div className="space-y-6">
            <Card className="bg-gray-900/60 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Stamp</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {payload.sku ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="text-white/80">
                        <div className="text-white/50">Brand</div>
                        <div className="font-medium text-white">{payload.sku.brandText}</div>
                      </div>
                      <div className="text-white/80">
                        <div className="text-white/50">Metal</div>
                        <div className="font-medium text-white">{payload.sku.metal}</div>
                      </div>
                      <div className="text-white/80">
                        <div className="text-white/50">Type</div>
                        <div className="font-medium text-white">{payload.sku.type}</div>
                      </div>
                      <div className="text-white/80">
                        <div className="text-white/50">Weight</div>
                        <div className="font-medium text-white">{formatWeight(payload.sku.weightGrams)}</div>
                      </div>
                      <div className="text-white/80">
                        <div className="text-white/50">Purity / Fineness</div>
                        <div className="font-medium text-white">{payload.sku.purity}</div>
                      </div>
                      <div className="text-white/80">
                        <div className="text-white/50">Hallmark</div>
                        <div className="font-medium text-white">{payload.sku.hallmarkText}</div>
                      </div>
                    </div>
                    <Separator className="bg-gray-800" />
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-white/80">
                        <div className="text-white/50">SKU Code</div>
                        <div className="font-mono text-white">{payload.sku.skuCode}</div>
                      </div>
                      <Badge className="bg-amber-500/15 text-amber-200 border border-amber-500/30">Legal stamp required</Badge>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-white/60">No SKU metadata found for this serial.</div>
                )}
              </CardContent>
            </Card>

            {payload.order ? (
              <Card className="bg-gray-900/60 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white">Order</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="text-white/80">
                      <div className="text-white/50">Order</div>
                      <div className="font-mono text-white">{payload.order.orderNumber}</div>
                    </div>
                    <div className="text-white/80">
                      <div className="text-white/50">Order status</div>
                      <div className="font-medium text-white">{payload.order.status}</div>
                    </div>
                  </div>
                  {payload.owner ? (
                    <>
                      <Separator className="bg-gray-800" />
                      <div className="text-sm text-white/80">
                        <div className="text-white/50">Owner (masked)</div>
                        <div className="font-medium text-white">
                          {[payload.owner.name, payload.owner.email, payload.owner.phone].filter(Boolean).join(" • ") || "—"}
                        </div>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {!payload.valid ? (
              <Card className="bg-gray-900/60 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-white">Next steps</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-white/70 space-y-2">
                  <p>
                    If you expected this serial to be valid, double-check the characters (O vs 0) and try again.
                  </p>
                  <p>If the issue persists, contact Bourse de l&rsquo;Or support with a photo of the stamp and the serial.</p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

