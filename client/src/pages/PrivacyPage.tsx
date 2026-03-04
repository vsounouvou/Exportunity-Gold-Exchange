import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLockup, InstitutionFooter } from "@pkg/branding";
import { formatPageTitle } from "@/lib/brand";
import { useTenant } from "@/lib/tenant";

export function PrivacyPage() {
  const { brand } = useTenant();
  useEffect(() => {
    document.title = formatPageTitle("Confidentialité", brand);
  }, [brand]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Accueil
          </Link>
          <BrandLockup subtitle="Confidentialité" />
          <div className="w-14" />
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card className="bg-gray-900/60 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-400" />
                Politique de confidentialité
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-3">
              <p>
                Ce document est un gabarit. Remplacez-le par votre politique de confidentialité (données collectées, finalités, conservation, droits, transferts, sécurité, cookies).
              </p>
              <p>
                Les informations et documents fournis dans les parcours de vérification sont utilisés pour l’évaluation de conformité et la sécurité opérationnelle.
              </p>
              <p className="text-white/50">
                À compléter : base légale, contact DPO, droits d’accès/rectification/suppression, gestion des cookies.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <InstitutionFooter />
    </div>
  );
}
