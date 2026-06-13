import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

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
    <div className="min-h-screen bg-[#0B0B0D] text-white">
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
            <Card key={card.title} className="border-white/10 bg-[#0D1B2A]/90">
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

export function BdoCertificationPage() {
  return (
    <div className="min-h-screen bg-[#0B0B0D] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <section className="overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-[#0D1B2A] shadow-xl">
          <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="p-6 md:p-8">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/90">Certification BOURSE DE L'OR</p>
              <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Certification et tracabilite de l'or physique</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F5F3EC]/80 md:text-base">
                Documentez une piece avec les informations disponibles au controle: photo, poids, titre, origine declaree,
                numero de certificat, QR de verification et historique lorsque les donnees sont disponibles.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/verifier">
                  <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">Verifier une piece</Button>
                </Link>
                <Link href="/store">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    Voir les produits
                  </Button>
                </Link>
              </div>
            </div>
            <div
              className="min-h-[260px] bg-cover bg-center lg:min-h-full"
              style={{ backgroundImage: "url('/tenants/bdo/official/banners/bdo-banner-certification.jpg')" }}
              aria-label="Lingot scelle avec certificat et controle de tracabilite BOURSE DE L'OR"
            />
          </div>
        </section>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            ["Ce qui est verifie", "Poids, titre, photos, certificat, numero de serie et elements d'origine disponibles au moment du controle."],
            ["QR et gold passport", "Chaque piece eligible peut etre reliee a une fiche de verification consultable par code ou QR."],
            ["Limites de responsabilite", "La certification documente les elements valides; elle ne remplace pas les obligations legales, fiscales ou douanieres."],
            ["Escalade humaine", "Les cas sensibles passent par une revue humaine avant toute validation publique ou transactionnelle."],
          ].map(([title, summary]) => (
            <Card key={title} className="border-white/10 bg-[#0D1B2A]/90">
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-[#E8C873]">{title}</h2>
                <p className="mt-1 text-sm text-white/70">{summary}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BdoVerifierPage() {
  const [code, setCode] = useState("");
  const cleanCode = code.trim().toUpperCase();
  const canVerify = cleanCode.length >= 4;

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-white">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-8 md:px-6 md:py-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#0D1B2A] via-[#0B0B0D] to-[#7A5A18] p-6 shadow-xl">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/90">Verification certificat</p>
          <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Verifier une piece</h1>
          <p className="mt-3 text-sm leading-6 text-[#F5F3EC]/80">
            Saisissez le numero de serie ou le code certificat pour consulter la fiche liee a une piece d'or certifiee.
          </p>

          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canVerify) window.location.href = `/verify/${encodeURIComponent(cleanCode)}`;
            }}
          >
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Code certificat</label>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="BDO-CI-2026-000001"
              className="h-12 w-full rounded-xl border border-[#D4AF37]/25 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#D4AF37]"
            />
            <Button type="submit" disabled={!canVerify} className="w-full bg-[#D4AF37] text-black hover:bg-[#E8C873] disabled:opacity-50">
              Verifier maintenant
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0D1B2A]/90 p-6">
          <h2 className="text-lg font-semibold text-white">Resultat de verification</h2>
          <div className="mt-4 rounded-xl border border-[#D4AF37]/20 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#E8C873]/85">Statut</p>
            <p className="mt-2 text-2xl font-semibold text-white">{canVerify ? "Pret pour consultation" : "Code requis"}</p>
            <p className="mt-2 text-sm leading-6 text-white/65">
              La fiche peut afficher le produit, le poids, le titre, la date, les photos, l'origine declaree, le certificat
              et l'historique disponible. Les donnees sensibles restent soumises a verification humaine.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {["Photo de la piece", "Poids et titre", "Numero de certificat", "Historique disponible"].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/75">
                {item}
              </div>
            ))}
          </div>
        </section>
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
