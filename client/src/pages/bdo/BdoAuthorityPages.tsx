import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type InsightCard = {
  title: string;
  summary: string;
};

function BdoAuthorityLayout({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle: string;
  cards: InsightCard[];
}) {
  return (
    <div className="min-h-screen bg-[#020817] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <div className="rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-r from-[#0B0B0D] via-[#0D1B2A] to-[#7A5A18] p-6 shadow-xl">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/90">Bourse de l'Or</p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-[#F5F3EC]/90 md:text-base">{subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/store">
              <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">Or Estampille</Button>
            </Link>
            <Link href="/espace-pro">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Espace Pro
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <Card key={card.title} className="border-white/10 bg-[#0b1220]/90">
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-[#E8C873]">{card.title}</h2>
                <p className="mt-1 text-sm text-white/70">{card.summary}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BdoActualitesPage() {
  return (
    <BdoAuthorityLayout
      title="Actualites & Reglementation"
      subtitle="Veille sur le marche de l'or, l'ecosysteme minier africain et les obligations de conformite."
      cards={[
        {
          title: "Actualites du marche",
          summary: "Cours internationaux, tendances de demande et signaux de liquidite pour l'or physique.",
        },
        {
          title: "Mines d'or en Cote d'Ivoire",
          summary: "Production, investissements et modernisation du secteur aurifere ivoirien.",
        },
        {
          title: "Cadre reglementaire",
          summary: "Exigences de tracabilite, obligations documentaires et controles qualite.",
        },
        {
          title: "Exportation & conformite",
          summary: "Flux mines -> certification -> expedition securisee vers les hubs internationaux.",
        },
      ]}
    />
  );
}

export function BdoReglementationPage() {
  return (
    <BdoAuthorityLayout
      title="Cadre legal de l'or"
      subtitle="References reglementaires pour les professionnels: mines, negociants, maisons et investisseurs."
      cards={[
        {
          title: "Reglementation miniere",
          summary: "Principes de gouvernance, licences, controles et obligations de declaration.",
        },
        {
          title: "Tracabilite et audit",
          summary: "Normes de preuve d'origine et chaine de custody pour chaque lot.",
        },
        {
          title: "Conformite KYC/AML",
          summary: "Bonnes pratiques de verification des contreparties dans l'ecosysteme aurifere.",
        },
        {
          title: "Cadre export",
          summary: "Points de controle avant expedition: qualite, documentation et conformite douaniere.",
        },
      ]}
    />
  );
}

export function BdoIndustrieMinierePage() {
  return (
    <BdoAuthorityLayout
      title="Industrie Miniere"
      subtitle="Panorama de l'industrie aurifere africaine avec focus Cote d'Ivoire."
      cards={[
        {
          title: "Bassins auriferes",
          summary: "Zones de production, capacites et dynamique de croissance regionale.",
        },
        {
          title: "Acteurs de la chaine",
          summary: "Mines, assayeurs, ateliers de frappe, logisticiens et maisons de distribution.",
        },
        {
          title: "Transformation locale",
          summary: "Structuration d'une valeur ajoutee africaine: certification, estampillage, distribution.",
        },
        {
          title: "Intelligence sectorielle",
          summary: "Risques, opportunites et signaux de marche utiles aux operateurs professionnels.",
        },
      ]}
    />
  );
}

export function BdoEspaceProPage() {
  return (
    <BdoAuthorityLayout
      title="Espace Pro"
      subtitle="L'espace dedie aux professionnels de l'or : mines, negociants, maisons, investisseurs et acheteurs en gros."
      cards={[
        {
          title: "Sourcing professionnel",
          summary: "Acces structure a des contreparties qualifiees avec documentation de tracabilite.",
        },
        {
          title: "Execution securisee",
          summary: "Flux de commande, verification et livraison adaptes aux operations professionnelles.",
        },
        {
          title: "Pilotage des risques",
          summary: "Cadres de conformite et controles de qualite integres au parcours transactionnel.",
        },
        {
          title: "Support institutionnel",
          summary: "Accompagnement des maisons, fonds et acheteurs professionnels sur les transactions d'or.",
        },
      ]}
    />
  );
}
