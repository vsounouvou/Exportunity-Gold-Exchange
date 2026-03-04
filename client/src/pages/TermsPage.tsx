import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, FileSignature } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLockup, InstitutionFooter } from "@pkg/branding";
import { formatPageTitle } from "@/lib/brand";
import { useTenant } from "@/lib/tenant";

export function TermsPage() {
  const { brand } = useTenant();
  useEffect(() => {
    document.title = formatPageTitle("Conditions d’utilisation", brand);
  }, [brand]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Accueil
          </Link>
          <BrandLockup subtitle="Conditions d’utilisation" />
          <div className="w-14" />
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card className="bg-gray-900/60 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-amber-400" />
                Conditions d’utilisation
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-3">
              <p>
                Ce document est un gabarit. Remplacez-le par vos conditions validées (juridiques, conformité, responsabilités, frais, litiges, etc.).
              </p>
              <p>
                L’accès et l’utilisation de la plateforme sont soumis aux exigences de conformité applicables et aux politiques de vérification.
              </p>
              <p className="text-white/50">
                À compléter : périmètre des services, règles de transaction, responsabilité, limitations, résiliation, loi applicable.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <InstitutionFooter />
    </div>
  );
}
