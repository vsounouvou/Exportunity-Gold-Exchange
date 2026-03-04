import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Clock, Copy, Loader2, XCircle } from "lucide-react";
import { BrandLockup, InstitutionFooter } from "@pkg/branding";
import { formatPageTitle } from "@/lib/brand";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useTenant } from "@/lib/tenant";

type StatusResponse = {
  applicationRef: string;
  status: string;
  aiReviewResult: string | null;
  aiReviewedAt: string | null;
  reviewedAt: string | null;
  adminReviewNote: string | null;
  updatedAt: string | null;
};

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (status === "rejected") return <XCircle className="h-5 w-5 text-red-400" />;
  return <Clock className="h-5 w-5 text-amber-400" />;
}

function formatStatusLabel(status: string) {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function ApplicationStatusPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { brand } = useTenant();

  const ref = new URLSearchParams(window.location.search).get("ref") || "";

  useEffect(() => {
    document.title = formatPageTitle("Statut de candidature", brand);
  }, [brand]);

  const query = useQuery<StatusResponse>({
    queryKey: ["ece-application-status", ref],
    enabled: !!ref,
    queryFn: async () => {
      const res = await fetch(
        resolveApiUrl(`/api/ece/applications/status?ref=${encodeURIComponent(ref)}`),
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Failed to fetch status");
      }
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col">
      <header className="border-b border-gray-800/50 bg-gray-950/80">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 text-gray-300 hover:text-white cursor-pointer">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </div>
          </Link>
          <BrandLockup subtitle="Statut de candidature" className="hidden sm:flex" />
          <Button variant="ghost" className="text-gray-300 hover:text-white" onClick={() => setLocation("/")}>
            Accueil
          </Button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg bg-gray-900 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Statut de la candidature</CardTitle>
            <CardDescription className="text-gray-400 flex items-center justify-between gap-2">
              <span className="truncate">Référence : {ref || "-"}</span>
              {ref ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-gray-300 hover:text-white"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(ref);
                      toast({ title: "Copié", description: "Référence copiée." });
                    } catch {
                      toast({ title: "Copie impossible", description: "Copiez la référence manuellement.", variant: "destructive" });
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!ref ? (
              <p className="text-sm text-gray-400">Référence de candidature manquante.</p>
            ) : query.isLoading ? (
              <div className="flex items-center gap-2 text-gray-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement du statut...
              </div>
            ) : query.isError ? (
              <div className="space-y-3">
                <p className="text-sm text-red-300">{String((query.error as any)?.message || "Impossible de charger le statut")}</p>
                <Button
                  className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                  onClick={() => {
                    toast({ title: "Nouvelle tentative", description: "Récupération du statut..." });
                    query.refetch();
                  }}
                >
                  Réessayer
                </Button>
              </div>
            ) : query.data ? (
              <div className="rounded-lg bg-gray-800/60 border border-gray-700 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-white">
                    <StatusIcon status={query.data.status} />
                    <span className="font-semibold">{formatStatusLabel(query.data.status)}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {query.data.updatedAt ? new Date(query.data.updatedAt).toLocaleDateString() : ""}
                  </span>
                </div>
                {query.data.aiReviewResult ? (
                  <p className="text-sm text-gray-300">Évaluation : {query.data.aiReviewResult}</p>
                ) : null}
                {query.data.adminReviewNote ? (
                  <p className="text-sm text-gray-300">Note : {query.data.adminReviewNote}</p>
                ) : null}
                <p className="text-xs text-gray-500">
                  Si des informations complémentaires sont nécessaires, la plateforme vous contactera via les coordonnées fournies.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Aucun statut trouvé pour cette référence.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <InstitutionFooter />
    </div>
  );
}
