import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLockup, InstitutionFooter } from "@pkg/branding";
import { formatPageTitle } from "@/lib/brand";
import { useTenant } from "@/lib/tenant";

export function CompliancePage() {
  const { brand } = useTenant();
  useEffect(() => {
    document.title = formatPageTitle("Cadre & conformité", brand);
  }, [brand]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Accueil
          </Link>
          <BrandLockup subtitle="Cadre & conformité" />
          <div className="w-14" />
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-white">Cadre & conformité</h1>
              <p className="text-sm text-white/60">
                L’accès à la plateforme est soumis aux exigences de conformité applicables et à la vérification des
                informations fournies.
              </p>
            </div>
          </div>

          <Card className="bg-gray-900/60 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg">Vérification (KYC / KYB)</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-2">
              <p>Des contrôles d’identité et/ou d’entreprise peuvent être requis selon le profil et les usages.</p>
              <p>La plateforme peut demander des justificatifs complémentaires avant d’activer certaines fonctionnalités.</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/60 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg">Lutte contre le blanchiment (AML)</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-2">
              <p>Des contrôles de cohérence et de risque peuvent être appliqués aux comptes et aux transactions.</p>
              <p>Les opérations suspectes peuvent faire l’objet de vérifications, de restrictions ou de suspension.</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/60 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg">Traçabilité</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-2">
              <p>Selon les modules activés, des informations de provenance, de documentation et de livraison peuvent être collectées.</p>
              <p>Les éléments fournis par les utilisateurs restent déterminants; la plateforme applique des contrôles mais ne remplace pas une due diligence interne.</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/60 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg">Documents</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-2">
              <p>
                Les documents requis (licences, enregistrements, autorisations, pièces d’identité, justificatifs) dépendent du parcours et du niveau d’accès.
              </p>
              <p>Les documents sont utilisés uniquement pour l’évaluation de conformité et la sécurité opérationnelle.</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900/60 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg">Liens légaux</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-2">
              <p>
                Consultez les documents contractuels et politiques applicables :
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <Link href="/terms" className="text-amber-400 hover:text-amber-300">
                  Conditions d’utilisation
                </Link>
                <Link href="/privacy" className="text-amber-400 hover:text-amber-300">
                  Politique de confidentialité
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <InstitutionFooter />
    </div>
  );
}
