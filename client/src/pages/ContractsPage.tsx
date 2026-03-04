import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ClipboardList,
  FileSignature,
  RefreshCw,
  Store,
  MapPin,
  Wallet,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

import { useSession } from "@/lib/session";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { getMineById } from "@/lib/miningModules";
import { MobileBottomNav } from "@/components/marketplace/MobileBottomNav";

type DigitalContract = {
  id: number;
  contractId: string;
  contractType: string;
  mineId: string;
  bureauAchatId: number | null;
  principalAmount: string;
  currency: string;
  startDate: string;
  endDate: string | null;
  payoutFrequency: string;
  returnModel: any;
  status: string;
  documents: any;
  metadata: any;
  bureau?: any | null;
  signatures?: Array<{ party: string; userId: number; signedAt: string }>;
  partyBUserId: number;
};

function safeDate(value: unknown) {
  const d = new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeClock(start: Date | null, end: Date | null) {
  if (!start || !end) return { day: null as number | null, total: null as number | null, progress: null as number | null };
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return { day: 0, total: 0, progress: 100 };
  const total = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  const elapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const day = Math.min(total, elapsed + 1);
  const progress = Math.max(0, Math.min(100, (elapsed / total) * 100));
  return { day, total, progress };
}

function returnModelLabel(model: any) {
  if (!model || typeof model !== "object") return "-";
  if (model.type === "revenue_share_percent") return `Revenue share (${Number(model.revenueSharePercent ?? 0)}%)`;
  if (model.type === "premium_per_rotation") return `Return per rotation (indicative) (${Number(model.premiumPerRotationPercent ?? 0)}%)`;
  return "-";
}

function nextPayoutHint(contract: Pick<DigitalContract, "payoutFrequency" | "startDate" | "endDate">) {
  const freq = String(contract.payoutFrequency || "");
  if (freq === "per_sale") return "Next payout: on next confirmed sale";
  if (freq === "per_rotation") return "Next payout: on next rotation event";
  if (freq === "monthly") {
    const start = safeDate(contract.startDate);
    const end = safeDate(contract.endDate);
    if (!start) return "Next payout: monthly";
    let next = new Date(start);
    while (next.getTime() <= Date.now()) {
      next = new Date(next.getFullYear(), next.getMonth() + 1, next.getDate());
      if (end && next.getTime() > end.getTime()) break;
    }
    return `Next payout: ${next.toISOString().slice(0, 10)}`;
  }
  return "Next payout: -";
}

export default function ContractsPage() {
  const session = useSession();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_signatures" | "active" | "completed" | "terminated">(
    "active",
  );

  const contractsQuery = useQuery<DigitalContract[]>({
    queryKey: ["/api/digital-contracts/contracts", session.token],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/digital-contracts/contracts"), {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: session.isAuthenticated && !!session.token,
  });

  const signMutation = useMutation({
    mutationFn: async (contractId: string) => {
      return apiRequest(`/api/digital-contracts/contracts/${encodeURIComponent(contractId)}/sign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/digital-contracts/contracts"] });
      toast({ title: "Signed", description: "Signature recorded." });
    },
    onError: (err: any) => toast({ title: "Sign failed", description: String(err?.message || err) }),
  });

  const contracts = contractsQuery.data || [];

  const filtered = useMemo(() => {
    if (statusFilter === "all") return contracts;
    return contracts.filter((c) => c.status === statusFilter);
  }, [contracts, statusFilter]);

  return (
    <div className="p-4 md:p-6 text-white pb-[calc(var(--bottom-stack-height)+16px)] md:pb-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-300" />
              Contracts
            </h1>
            <p className="text-xs text-white/60">Digitally managed contracts with time-bound participation.</p>
          </div>

          <Button
            variant="outline"
            className="border-white/15 text-white/80 hover:bg-white/10 gap-2"
            onClick={() => {
              contractsQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["active", "pending_signatures", "completed", "terminated", "all"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              className={
                statusFilter === s ? "bg-white/10 text-white" : "border-white/15 text-white/70 hover:bg-white/10"
              }
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s.replace("_", " ")}
            </Button>
          ))}
        </div>

        <Card className="bg-gray-900/60 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Correct model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-white/70">
            <p>
              Licensing directories are territorial reference data. Contracts are voluntary relationships between parties. Purchase orders and settlements only happen <span className="text-white">inside</span> a contract.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="bg-white/10 text-white hover:bg-white/15 gap-2"
                onClick={() => navigate("/territories")}
              >
                Territories registry
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10 gap-2"
                onClick={() => navigate("/bureaus")}
              >
                Bureau d&apos;Achat directory
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((c) => {
            const start = safeDate(c.startDate);
            const end = safeDate(c.endDate);
            const clock = computeClock(start, end);
            const mine = getMineById(c.mineId);
            const bureauName = c.bureau?.legalName || c.bureau?.name || (c.bureauAchatId ? `Bureau #${c.bureauAchatId}` : "-");
            const hasSignedInvestor = (c.signatures || []).some((s) => s.party === "partyB" && s.userId === session.user?.id);
            const needsInvestorSignature = (c.metadata?.requiredParties || []).includes("partyB") && !hasSignedInvestor;

            return (
              <Card key={c.contractId} className="bg-gray-900/60 border-white/10">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{mine?.legalName || mine?.id || c.mineId}</p>
                      <p className="text-[11px] text-white/60 truncate">
                        {c.contractId} | {bureauName}
                      </p>
                    </div>
                    <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/30">{String(c.status).toUpperCase()}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-white/70">
                    <span>{returnModelLabel(c.returnModel)}</span>
                    <span className="text-white/60">{String(c.payoutFrequency).replace("_", " ")}</span>
                  </div>
                  <p className="text-[11px] text-white/60">{nextPayoutHint(c)}</p>

                  {clock.total != null ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-white/60">
                        <span>
                          Day {clock.day} of {clock.total}
                        </span>
                        <span>{start?.toISOString().slice(0, 10)} -&gt; {end?.toISOString().slice(0, 10)}</span>
                      </div>
                      <Progress value={clock.progress ?? 0} />
                    </div>
                  ) : (
                    <p className="text-[11px] text-white/60">Time window: {c.startDate?.slice(0, 10)} -&gt; {c.endDate?.slice(0, 10) || "-"}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {needsInvestorSignature && (
                      <Button
                        size="sm"
                        className="bg-emerald-500 text-black hover:bg-emerald-600 gap-2"
                        disabled={signMutation.isPending}
                        onClick={() => signMutation.mutate(c.contractId)}
                      >
                        <FileSignature className="h-4 w-4" />
                        Sign (Investor)
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="bg-white/10 text-white hover:bg-white/15 gap-2"
                      onClick={() => navigate(`/contracts/${encodeURIComponent(c.contractId)}`)}
                    >
                      Open
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    {c.documents?.previewText ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/15 text-white/80 hover:bg-white/10"
                        onClick={() => {
                          const text = String(c.documents?.previewText || "");
                          navigator.clipboard?.writeText?.(text);
                          toast({ title: "Copied", description: "Contract preview copied to clipboard." });
                        }}
                      >
                        Copy Preview
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <MobileBottomNav
        items={[
          {
            key: "browse",
            label: "Browse",
            icon: <Store className="h-4 w-4" />,
            onPress: () => navigate("/?mode=retail"),
          },
          {
            key: "map",
            label: "Map",
            icon: <MapPin className="h-4 w-4" />,
            onPress: () => navigate("/?panel=map"),
          },
          {
            key: "wallet",
            label: "Wallet",
            icon: <Wallet className="h-4 w-4" />,
            primary: true,
            onPress: () => navigate("/?panel=wallet"),
          },
          {
            key: "vault",
            label: "Vault",
            icon: <ShieldCheck className="h-4 w-4" />,
            onPress: () => navigate("/?panel=vault"),
          },
        ]}
      />
    </div>
  );
}
