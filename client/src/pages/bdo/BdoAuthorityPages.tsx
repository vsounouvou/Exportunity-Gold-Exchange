import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

type InsightCard = {
  title: string;
  summary: string;
};

function getAuthorityCopy(language: string) {
  if (language === "ar") {
    return {
      brand: "BOURSE DE L'OR",
      certificationEyebrow: "شهادة BOURSE DE L'OR",
      certificationTitle: "شهادة وتتبع الذهب المادي",
      certificationBody:
        "وثّق قطعة ذهبية بالمعلومات المتاحة أثناء الفحص: الصورة، الوزن، العيار، الأصل المصرح به، رقم الشهادة، رمز QR وسجل التحقق عندما تكون البيانات متاحة.",
      verifyPiece: "تحقق من قطعة",
      viewProducts: "عرض المنتجات",
      certificationCards: [
        ["ما يتم التحقق منه", "الوزن، العيار، الصور، الشهادة، الرقم التسلسلي وعناصر الأصل المتاحة وقت الفحص."],
        ["QR وجواز الذهب", "يمكن ربط كل قطعة مؤهلة بصفحة تحقق يمكن فتحها برمز أو QR."],
        ["حدود المسؤولية", "توثق الشهادة العناصر التي تم التحقق منها؛ ولا تستبدل الالتزامات القانونية أو الضريبية أو الجمركية."],
        ["تصعيد بشري", "الحالات الحساسة تمر بمراجعة بشرية قبل أي تحقق عام أو إجراء معاملاتي."],
      ],
      verifierEyebrow: "التحقق من الشهادة",
      verifierTitle: "تحقق من قطعة",
      verifierBody:
        "أدخل الرقم التسلسلي أو رمز الشهادة للاطلاع على صفحة مرتبطة بقطعة ذهب معتمدة.",
      certificateCode: "رمز الشهادة",
      verifyNow: "تحقق الآن",
      resultTitle: "نتيجة التحقق",
      status: "الحالة",
      ready: "جاهز للاستشارة",
      codeRequired: "الرمز مطلوب",
      resultBody:
        "يمكن أن تعرض الصفحة المنتج، الوزن، العيار، التاريخ، الصور، الأصل المصرح به، الشهادة والسجل المتاح. تبقى البيانات الحساسة خاضعة لمراجعة بشرية.",
      resultItems: ["صورة القطعة", "الوزن والعيار", "رقم الشهادة", "السجل المتاح"],
    };
  }

  if (language === "en") {
    return {
      brand: "BOURSE DE L'OR",
      certificationEyebrow: "BOURSE DE L'OR certification",
      certificationTitle: "Certification and traceability for physical gold",
      certificationBody:
        "Document a piece with the information available at inspection: photo, weight, title, declared origin, certificate number, QR verification and history when available.",
      verifyPiece: "Verify a piece",
      viewProducts: "View products",
      certificationCards: [
        ["What is verified", "Weight, title, photos, certificate, serial number and available origin elements at the time of inspection."],
        ["QR and gold passport", "Each eligible piece can be linked to a verification record accessible by code or QR."],
        ["Liability limits", "Certification documents validated elements; it does not replace legal, tax or customs obligations."],
        ["Human escalation", "Sensitive cases go through human review before any public or transactional validation."],
      ],
      verifierEyebrow: "Certificate verification",
      verifierTitle: "Verify a piece",
      verifierBody:
        "Enter the serial number or certificate code to consult the record linked to a certified gold piece.",
      certificateCode: "Certificate code",
      verifyNow: "Verify now",
      resultTitle: "Verification result",
      status: "Status",
      ready: "Ready for consultation",
      codeRequired: "Code required",
      resultBody:
        "The record can display the product, weight, title, date, photos, declared origin, certificate and available history. Sensitive data remains subject to human verification.",
      resultItems: ["Piece photo", "Weight and title", "Certificate number", "Available history"],
    };
  }

  return {
    brand: "BOURSE DE L'OR",
    certificationEyebrow: "Certification BOURSE DE L'OR",
    certificationTitle: "Certification et traçabilité de l'or physique",
    certificationBody:
      "Documentez une pièce avec les informations disponibles au contrôle : photo, poids, titre, origine déclarée, numéro de certificat, QR de vérification et historique lorsque les données sont disponibles.",
    verifyPiece: "Vérifier une pièce",
    viewProducts: "Voir les produits",
    certificationCards: [
      ["Ce qui est vérifié", "Poids, titre, photos, certificat, numéro de série et éléments d'origine disponibles au moment du contrôle."],
      ["QR et gold passport", "Chaque pièce éligible peut être reliée à une fiche de vérification consultable par code ou QR."],
      ["Limites de responsabilité", "La certification documente les éléments validés; elle ne remplace pas les obligations légales, fiscales ou douanières."],
      ["Escalade humaine", "Les cas sensibles passent par une revue humaine avant toute validation publique ou transactionnelle."],
    ],
    verifierEyebrow: "Vérification certificat",
    verifierTitle: "Vérifier une pièce",
    verifierBody:
      "Saisissez le numéro de série ou le code certificat pour consulter la fiche liée à une pièce d'or certifiée.",
    certificateCode: "Code certificat",
    verifyNow: "Vérifier maintenant",
    resultTitle: "Résultat de vérification",
    status: "Statut",
    ready: "Prêt pour consultation",
    codeRequired: "Code requis",
    resultBody:
      "La fiche peut afficher le produit, le poids, le titre, la date, les photos, l'origine déclarée, le certificat et l'historique disponible. Les données sensibles restent soumises à vérification humaine.",
    resultItems: ["Photo de la pièce", "Poids et titre", "Numéro de certificat", "Historique disponible"],
  };
}

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
  const { language } = useLocale();
  const copy = getAuthorityCopy(language);

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <section className="overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-[#0D1B2A] shadow-xl">
          <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="p-6 md:p-8">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/90">{copy.certificationEyebrow}</p>
              <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">{copy.certificationTitle}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F5F3EC]/80 md:text-base">
                {copy.certificationBody}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/verifier">
                  <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">{copy.verifyPiece}</Button>
                </Link>
                <Link href="/store">
                  <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    {copy.viewProducts}
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
          {copy.certificationCards.map(([title, summary]) => (
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
  const { language } = useLocale();
  const copy = getAuthorityCopy(language);
  const [code, setCode] = useState("");
  const cleanCode = code.trim().toUpperCase();
  const canVerify = cleanCode.length >= 4;

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-white">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-8 md:px-6 md:py-10 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#0D1B2A] via-[#0B0B0D] to-[#7A5A18] p-6 shadow-xl">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/90">{copy.brand}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/75">{copy.verifierEyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">{copy.verifierTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-[#F5F3EC]/80">
            {copy.verifierBody}
          </p>

          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canVerify) window.location.href = `/verify/${encodeURIComponent(cleanCode)}`;
            }}
          >
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/55">{copy.certificateCode}</label>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="BDO-CI-2026-000001"
              className="h-12 w-full rounded-xl border border-[#D4AF37]/25 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#D4AF37]"
            />
            <Button type="submit" disabled={!canVerify} className="w-full bg-[#D4AF37] text-black hover:bg-[#E8C873] disabled:opacity-50">
              {copy.verifyNow}
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0D1B2A]/90 p-6">
          <h2 className="text-lg font-semibold text-white">{copy.resultTitle}</h2>
          <div className="mt-4 rounded-xl border border-[#D4AF37]/20 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#E8C873]/85">{copy.status}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{canVerify ? copy.ready : copy.codeRequired}</p>
            <p className="mt-2 text-sm leading-6 text-white/65">
              {copy.resultBody}
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {copy.resultItems.map((item) => (
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

type AuthorityTopicKey = "actualites" | "reglementation" | "industrie";

const authorityTopicCopy: Record<string, Record<AuthorityTopicKey, { title: string; subtitle: string; cards: InsightCard[] }>> = {
  fr: {
    actualites: {
      title: "Actualites et marche de l'or",
      subtitle: "Veille sur le marche de l'or, l'ecosysteme minier africain et les obligations de conformite.",
      cards: [
        { title: "Actualites du marche", summary: "Cours internationaux, tendances de demande et signaux de liquidite pour l'or physique certifie." },
        { title: "Mines d'or en Cote d'Ivoire", summary: "Production, investissements et modernisation du secteur aurifere ivoirien." },
        { title: "Cadre reglementaire", summary: "Exigences de tracabilite, obligations documentaires et controles qualite." },
        { title: "Exportation et conformite", summary: "Flux mines, certification, expedition securisee et revue des contreparties." },
      ],
    },
    reglementation: {
      title: "Cadre legal de l'or",
      subtitle: "References reglementaires pour les professionnels: mines, negociants, maisons et investisseurs.",
      cards: [
        { title: "Reglementation miniere", summary: "Principes de gouvernance, licences, controles et obligations de declaration." },
        { title: "Tracabilite et audit", summary: "Normes de preuve d'origine et chaine de custody pour chaque lot." },
        { title: "Conformite KYC/AML", summary: "Verification des contreparties, origine des fonds et revue documentaire." },
        { title: "Cadre export", summary: "Points de controle avant expedition: qualite, documentation et conformite douaniere." },
      ],
    },
    industrie: {
      title: "Industrie miniere aurifere",
      subtitle: "Panorama de l'industrie aurifere africaine avec focus Cote d'Ivoire.",
      cards: [
        { title: "Bassins auriferes", summary: "Zones de production, capacites et dynamique de croissance regionale." },
        { title: "Acteurs de la chaine", summary: "Mines, assayeurs, ateliers de frappe, logisticiens et maisons de distribution." },
        { title: "Transformation locale", summary: "Structuration d'une valeur ajoutee africaine: certification, estampillage, distribution." },
        { title: "Intelligence sectorielle", summary: "Risques, opportunites et signaux de marche utiles aux operateurs professionnels." },
      ],
    },
  },
  en: {
    actualites: {
      title: "Gold market news",
      subtitle: "Market watch for certified physical gold, African mining activity and compliance obligations.",
      cards: [
        { title: "Market news", summary: "International gold prices, demand trends and liquidity signals for certified physical gold." },
        { title: "Gold mining in Cote d'Ivoire", summary: "Production, investment and modernization of the Ivorian gold sector." },
        { title: "Regulatory framework", summary: "Traceability requirements, document obligations and quality controls." },
        { title: "Export and compliance", summary: "Mining, certification, secure delivery and counterparty review workflows." },
      ],
    },
    reglementation: {
      title: "Gold regulatory framework",
      subtitle: "Regulatory references for miners, traders, dealers, institutions and professional buyers.",
      cards: [
        { title: "Mining regulation", summary: "Governance principles, licensing, controls and reporting obligations." },
        { title: "Traceability and audit", summary: "Origin evidence and custody-chain standards for each lot." },
        { title: "KYC/AML compliance", summary: "Counterparty checks, source of funds review and document verification." },
        { title: "Export framework", summary: "Quality, documentation and customs checks before shipment." },
      ],
    },
    industrie: {
      title: "Gold mining industry",
      subtitle: "A professional view of the African gold industry with a Cote d'Ivoire focus.",
      cards: [
        { title: "Gold regions", summary: "Production areas, capacity and regional growth dynamics." },
        { title: "Supply-chain actors", summary: "Mines, assayers, minting studios, logistics partners and distribution houses." },
        { title: "Local transformation", summary: "African value creation through certification, stamping and distribution." },
        { title: "Sector intelligence", summary: "Risks, opportunities and market signals for professional operators." },
      ],
    },
  },
  ar: {
    actualites: {
      title: "أخبار سوق الذهب",
      subtitle: "متابعة سوق الذهب المادي المعتمد ونشاط التعدين الأفريقي ومتطلبات الامتثال.",
      cards: [
        { title: "أخبار السوق", summary: "أسعار الذهب الدولية واتجاهات الطلب ومؤشرات السيولة للذهب المادي المعتمد." },
        { title: "تعدين الذهب في كوت ديفوار", summary: "الإنتاج والاستثمارات وتحديث قطاع الذهب في كوت ديفوار." },
        { title: "الإطار التنظيمي", summary: "متطلبات التتبع والوثائق وضوابط الجودة." },
        { title: "التصدير والامتثال", summary: "مسارات التعدين والشهادة والتسليم الآمن ومراجعة الأطراف." },
      ],
    },
    reglementation: {
      title: "الإطار التنظيمي للذهب",
      subtitle: "مراجع تنظيمية للمهنيين: المناجم والتجار والبيوت والمؤسسات والمشترون المحترفون.",
      cards: [
        { title: "تنظيم التعدين", summary: "مبادئ الحوكمة والتراخيص والرقابة والتصريح." },
        { title: "التتبع والتدقيق", summary: "معايير إثبات الأصل وسلسلة الحيازة لكل دفعة." },
        { title: "امتثال KYC/AML", summary: "فحص الأطراف ومصدر الأموال والتحقق من الوثائق." },
        { title: "إطار التصدير", summary: "نقاط مراقبة الجودة والوثائق والجمارك قبل الشحن." },
      ],
    },
    industrie: {
      title: "صناعة تعدين الذهب",
      subtitle: "نظرة مهنية على صناعة الذهب الأفريقية مع تركيز على كوت ديفوار.",
      cards: [
        { title: "مناطق الذهب", summary: "مناطق الإنتاج والقدرات وديناميكيات النمو الإقليمي." },
        { title: "أطراف سلسلة القيمة", summary: "المناجم والمحللون وورش الختم وشركاء اللوجستيات وبيوت التوزيع." },
        { title: "التحويل المحلي", summary: "خلق قيمة أفريقية عبر الشهادة والختم والتوزيع." },
        { title: "ذكاء القطاع", summary: "المخاطر والفرص وإشارات السوق المفيدة للمهنيين." },
      ],
    },
  },
};

function getAuthorityTopic(language: string, key: AuthorityTopicKey) {
  return (authorityTopicCopy[language] || authorityTopicCopy.fr)[key];
}

export function BdoActualitesPage() {
  const { language } = useLocale();
  const copy = getAuthorityTopic(language, "actualites");
  return <BdoAuthorityLayout title={copy.title} subtitle={copy.subtitle} cards={copy.cards} />;
}

export function BdoReglementationPage() {
  const { language } = useLocale();
  const copy = getAuthorityTopic(language, "reglementation");
  return <BdoAuthorityLayout title={copy.title} subtitle={copy.subtitle} cards={copy.cards} />;
}

export function BdoIndustrieMinierePage() {
  const { language } = useLocale();
  const copy = getAuthorityTopic(language, "industrie");
  return <BdoAuthorityLayout title={copy.title} subtitle={copy.subtitle} cards={copy.cards} />;
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
