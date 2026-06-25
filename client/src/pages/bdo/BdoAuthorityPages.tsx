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
      certificationTitle: "توثيق وتتبع الذهب المادي",
      certificationBody:
        "يمكن توثيق قطعة ذهبية بالمعلومات المتاحة وقت الفحص: الصورة، الوزن، العيار، الأصل المصرح به، رقم الشهادة، رمز QR وسجل التحقق عند توفر البيانات. لا تعني الشهادة وعداً مالياً أو ضماناً للعائد.",
      verifyPiece: "تحقق من قطعة",
      viewProducts: "عرض المنتجات",
      certificationCards: [
        ["ما يتم التحقق منه", "الوزن، العيار، الصور، الرقم التسلسلي، الشهادة وعناصر الأصل المتاحة وقت الفحص."],
        ["QR وجواز الذهب", "يمكن ربط كل قطعة مؤهلة بسجل تحقق يمكن فتحه بالرمز أو QR عند توفر البيانات."],
        ["حدود المسؤولية", "توثق الشهادة العناصر التي تم التحقق منها؛ ولا تستبدل الالتزامات القانونية أو الضريبية أو الجمركية."],
        ["مراجعة بشرية", "الحالات الحساسة تخضع لمراجعة بشرية قبل أي تحقق عام أو إجراء مرتبط بمعاملة."],
      ],
      verifierEyebrow: "التحقق من الشهادة",
      verifierTitle: "تحقق من قطعة",
      verifierBody:
        "أدخل الرقم التسلسلي أو رمز الشهادة للاطلاع على السجل المرتبط بمنتج ذهب مادي موثق. قد تتطلب بعض النتائج مراجعة بشرية قبل التأكيد النهائي.",
      certificateCode: "رمز الشهادة",
      verifyNow: "تحقق الآن",
      resultTitle: "نتيجة التحقق",
      status: "الحالة",
      ready: "جاهز للاستشارة",
      codeRequired: "الرمز مطلوب",
      resultBody:
        "يمكن أن يعرض السجل المنتج والوزن والعيار والتاريخ والصور والأصل المصرح به والشهادة والسجل المتاح. تبقى البيانات الحساسة خاضعة لمراجعة بشرية.",
      resultItems: ["صورة القطعة", "الوزن والعيار", "رقم الشهادة", "السجل المتاح"],
    };
  }

  if (language === "en") {
    return {
      brand: "BOURSE DE L'OR",
      certificationEyebrow: "BOURSE DE L'OR certification",
      certificationTitle: "Documentation and traceability for physical gold",
      certificationBody:
        "Document a gold item with the information available at inspection: photo, weight, purity, declared origin, certificate number, QR verification, and history when available. Certification documents verified elements; it is not a financial promise or return guarantee.",
      verifyPiece: "Verify a piece",
      viewProducts: "View products",
      certificationCards: [
        ["What is verified", "Weight, purity, photos, serial number, certificate, and available origin elements at the time of inspection."],
        ["QR and gold passport", "Each eligible item can be linked to a verification record accessible by code or QR when data is available."],
        ["Liability limits", "Certification documents validated elements; it does not replace legal, tax, or customs obligations."],
        ["Human review", "Sensitive cases go through human review before any public or transactional validation."],
      ],
      verifierEyebrow: "Certificate verification",
      verifierTitle: "Verify a piece",
      verifierBody:
        "Enter the serial number or certificate code to consult the record linked to a documented physical gold product. Some results may require human review before final confirmation.",
      certificateCode: "Certificate code",
      verifyNow: "Verify now",
      resultTitle: "Verification result",
      status: "Status",
      ready: "Ready for consultation",
      codeRequired: "Code required",
      resultBody:
        "The record can display the product, weight, purity, date, photos, declared origin, certificate, and available history. Sensitive data remains subject to human verification.",
      resultItems: ["Piece photo", "Weight and purity", "Certificate number", "Available history"],
    };
  }

  return {
    brand: "BOURSE DE L'OR",
    certificationEyebrow: "Certification BOURSE DE L'OR",
    certificationTitle: "Documentation et traçabilité de l'or physique",
    certificationBody:
      "Documentez une pièce avec les informations disponibles au contrôle : photo, poids, titre, origine déclarée, numéro de certificat, QR de vérification et historique lorsque les données sont disponibles. La certification documente des éléments vérifiés; elle ne constitue pas une promesse financière ni une garantie de rendement.",
    verifyPiece: "Vérifier une pièce",
    viewProducts: "Voir les produits",
    certificationCards: [
      ["Ce qui est vérifié", "Poids, titre, photos, numéro de série, certificat et éléments d'origine disponibles au moment du contrôle."],
      ["QR et gold passport", "Chaque pièce éligible peut être reliée à une fiche de vérification consultable par code ou QR lorsque les données existent."],
      ["Limites de responsabilité", "La certification documente les éléments validés; elle ne remplace pas les obligations légales, fiscales ou douanières."],
      ["Revue humaine", "Les cas sensibles passent par une revue humaine avant toute validation publique ou transactionnelle."],
    ],
    verifierEyebrow: "Vérification certificat",
    verifierTitle: "Vérifier une pièce",
    verifierBody:
      "Saisissez le numéro de série ou le code certificat pour consulter la fiche liée à un produit en or physique documenté. Certains résultats peuvent nécessiter une revue humaine avant confirmation finale.",
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
              <Button className="bg-[#D4AF37] text-black hover:bg-[#E8C873]">Or Estampillé</Button>
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
              aria-label="Lingot scellé avec certificat et contrôle de traçabilité BOURSE DE L'OR"
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
              const formData = new FormData(event.currentTarget);
              const submittedCode = String(formData.get("certificateCode") || code)
                .trim()
                .toUpperCase();
              if (submittedCode.length >= 4) {
                window.location.href = `/verify/${encodeURIComponent(submittedCode)}`;
              }
            }}
          >
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/55">{copy.certificateCode}</label>
            <input
              name="certificateCode"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onInput={(event) => setCode(event.currentTarget.value)}
              placeholder="BDO-CI-2026-000001"
              className="h-12 w-full rounded-xl border border-[#D4AF37]/25 bg-black/35 px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#D4AF37]"
            />
            <Button type="submit" className="w-full bg-[#D4AF37] text-black hover:bg-[#E8C873]">
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

const bdoInfoPages: Record<string, { title: string; subtitle: string; cards: InsightCard[] }> = {
  conformite: {
    title: "Conformité des transactions",
    subtitle:
      "Certaines transactions peuvent nécessiter une vérification KYC/KYB, une revue de conformité, une confirmation du paiement et une validation finale.",
    cards: [
      {
        title: "Revue KYC / KYB",
        summary:
          "La Bourse de l'Or peut demander des documents d'identité, d'entreprise, de source de fonds ou de source de biens avant de confirmer une transaction.",
      },
      {
        title: "Disponibilité et refus",
        summary:
          "Une commande peut être refusée, retardée ou annulée si les conditions légales, de conformité, de paiement ou de sourcing responsable ne sont pas remplies.",
      },
      {
        title: "Sourcing responsable",
        summary:
          "La plateforme ne soutient pas le commerce d'or illégal, non documenté, lié à un conflit ou non conforme aux principes AML, sanctions et traçabilité.",
      },
      {
        title: "Pas de conseil financier",
        summary:
          "La Bourse de l'Or ne fournit pas de conseil financier, fiscal, juridique ou d'investissement. Les achats d'or comportent un risque de fluctuation du prix.",
      },
    ],
  },
  processus: {
    title: "Processus d'achat",
    subtitle:
      "Le parcours client reste simple : choisir un produit, confirmer le prix, valider la commande puis organiser la livraison, le retrait ou le stockage lorsque disponible.",
    cards: [
      { title: "1. Sélection", summary: "Le client sélectionne un produit en or physique, une pièce, un lingot, un bijou vérifié ou une création sur commande." },
      { title: "2. Confirmation", summary: "La plateforme confirme disponibilité, prix indicatif ou final, conditions de paiement et éventuelles vérifications nécessaires." },
      { title: "3. Préparation", summary: "Le produit est sourcé auprès d'un partenaire approuvé, vérifié, documenté puis préparé selon le parcours validé." },
      { title: "4. Remise", summary: "Le client reçoit une confirmation avant livraison, retrait ou stockage sécurisé, selon disponibilité et conditions applicables." },
    ],
  },
  prix: {
    title: "Prix indicatifs",
    subtitle:
      "Les prix affichés peuvent rester indicatifs jusqu'à confirmation finale, car ils dépendent du marché de l'or et des conditions opérationnelles.",
    cards: [
      { title: "Cours international", summary: "Le prix peut varier selon le cours international de l'or, le titre, le poids et les primes applicables." },
      { title: "Coûts de production", summary: "Raffinage, fabrication, gravure, certification, marge plateforme et conditions partenaire peuvent modifier le total payable." },
      { title: "Logistique et taxes", summary: "Livraison, assurance, douanes, droits, taxes et stockage sont confirmés séparément lorsqu'ils s'appliquent." },
      { title: "Confirmation finale", summary: "Le transfert de propriété intervient uniquement après paiement complet, conformité validée et confirmation finale." },
    ],
  },
};

function BdoInfoPage({ pageKey }: { pageKey: keyof typeof bdoInfoPages }) {
  const page = bdoInfoPages[pageKey];
  return <BdoAuthorityLayout title={page.title} subtitle={page.subtitle} cards={page.cards} />;
}

export function BdoConformitePage() {
  return <BdoInfoPage pageKey="conformite" />;
}

export function BdoProcessusPage() {
  return <BdoInfoPage pageKey="processus" />;
}

export function BdoPrixIndicatifPage() {
  return <BdoInfoPage pageKey="prix" />;
}

type AuthorityTopicKey = "actualites" | "reglementation" | "industrie" | "pro";

const authorityTopicCopy: Record<string, Record<AuthorityTopicKey, { title: string; subtitle: string; cards: InsightCard[] }>> = {
  fr: {
    actualites: {
      title: "Actualités et marché de l'or",
      subtitle: "Veille sur le marché de l'or physique, l'écosystème minier africain et les obligations de conformité.",
      cards: [
        { title: "Actualités du marché", summary: "Cours internationaux, tendances de demande et signaux de marché pour l'or physique documenté." },
        { title: "Mines d'or en Côte d'Ivoire", summary: "Production, structuration et modernisation du secteur aurifère ivoirien." },
        { title: "Cadre réglementaire", summary: "Exigences de traçabilité, obligations documentaires et contrôles qualité." },
        { title: "Exportation et conformité", summary: "Flux mines, vérification, expédition sécurisée et revue des contreparties." },
      ],
    },
    reglementation: {
      title: "Cadre légal de l'or",
      subtitle: "Repères réglementaires pour mines, négociants, maisons d'achat, institutions et acheteurs professionnels.",
      cards: [
        { title: "Réglementation minière", summary: "Principes de gouvernance, licences, contrôles et obligations de déclaration." },
        { title: "Traçabilité et audit", summary: "Preuve d'origine et chaîne de conservation documentée pour chaque lot." },
        { title: "Conformité KYC/AML", summary: "Vérification des contreparties, origine des fonds et revue documentaire." },
        { title: "Cadre export", summary: "Points de contrôle avant expédition: qualité, documentation et conformité douanière." },
      ],
    },
    industrie: {
      title: "Industrie minière aurifère",
      subtitle: "Panorama de l'industrie aurifère africaine avec focus Côte d'Ivoire.",
      cards: [
        { title: "Bassins aurifères", summary: "Zones de production, capacités et dynamique régionale." },
        { title: "Acteurs de la chaîne", summary: "Mines, assayeurs, ateliers, logisticiens et maisons de distribution." },
        { title: "Transformation locale", summary: "Création de valeur africaine par documentation, estampillage, joaillerie et distribution." },
        { title: "Intelligence sectorielle", summary: "Risques, opportunités et signaux de marché utiles aux opérateurs professionnels." },
      ],
    },
    pro: {
      title: "Espace Pro",
      subtitle: "Espace dédié aux professionnels de l'or: mines, négociants, maisons d'achat, fournisseurs, artisans et acheteurs en gros soumis à revue.",
      cards: [
        { title: "Sourcing professionnel", summary: "Accès structuré à des contreparties qualifiées avec documentation de traçabilité." },
        { title: "Exécution encadrée", summary: "Flux de commande, vérification et livraison adaptés aux opérations professionnelles." },
        { title: "Pilotage des risques", summary: "Cadres de conformité, source des fonds, source des biens et contrôles qualité." },
        { title: "Support institutionnel", summary: "Accompagnement des maisons, fournisseurs et acheteurs professionnels selon disponibilité et conformité." },
      ],
    },
  },
  en: {
    actualites: {
      title: "Gold market news",
      subtitle: "Market watch for physical gold, African mining activity, and compliance obligations.",
      cards: [
        { title: "Market news", summary: "International gold prices, demand trends, and market signals for documented physical gold." },
        { title: "Gold mining in Côte d'Ivoire", summary: "Production, structuring, and modernization of the Ivorian gold sector." },
        { title: "Regulatory framework", summary: "Traceability requirements, document obligations, and quality controls." },
        { title: "Export and compliance", summary: "Mine flows, verification, secure delivery, and counterparty review workflows." },
      ],
    },
    reglementation: {
      title: "Gold regulatory framework",
      subtitle: "Regulatory references for miners, traders, buying houses, institutions, and professional buyers.",
      cards: [
        { title: "Mining regulation", summary: "Governance principles, licensing, controls, and reporting obligations." },
        { title: "Traceability and audit", summary: "Origin evidence and documented custody-chain standards for each lot." },
        { title: "KYC/AML compliance", summary: "Counterparty checks, source of funds review, and document verification." },
        { title: "Export framework", summary: "Quality, documentation, and customs checks before shipment." },
      ],
    },
    industrie: {
      title: "Gold mining industry",
      subtitle: "A professional view of the African gold industry with a Côte d'Ivoire focus.",
      cards: [
        { title: "Gold regions", summary: "Production areas, capacity, and regional dynamics." },
        { title: "Supply-chain actors", summary: "Mines, assayers, workshops, logistics partners, and distribution houses." },
        { title: "Local transformation", summary: "African value creation through documentation, stamping, jewelry, and distribution." },
        { title: "Sector intelligence", summary: "Risks, opportunities, and market signals for professional operators." },
      ],
    },
    pro: {
      title: "Professional Space",
      subtitle: "A dedicated space for gold professionals: mines, traders, buying houses, suppliers, artisans, and wholesale buyers subject to review.",
      cards: [
        { title: "Professional sourcing", summary: "Structured access to qualified counterparties with traceability documentation." },
        { title: "Controlled execution", summary: "Order, verification, and delivery flows adapted to professional operations." },
        { title: "Risk oversight", summary: "Compliance, source of funds, source of goods, and quality-control frameworks." },
        { title: "Institutional support", summary: "Support for houses, suppliers, and professional buyers depending on availability and compliance." },
      ],
    },
  },
  ar: {
    actualites: {
      title: "أخبار سوق الذهب",
      subtitle: "متابعة سوق الذهب المادي ونشاط التعدين الأفريقي ومتطلبات الامتثال.",
      cards: [
        { title: "أخبار السوق", summary: "أسعار الذهب الدولية واتجاهات الطلب ومؤشرات السوق للذهب المادي الموثق." },
        { title: "تعدين الذهب في كوت ديفوار", summary: "الإنتاج والتنظيم وتحديث قطاع الذهب في كوت ديفوار." },
        { title: "الإطار التنظيمي", summary: "متطلبات التتبع والوثائق وضوابط الجودة." },
        { title: "التصدير والامتثال", summary: "مسارات المناجم والتحقق والتسليم الآمن ومراجعة الأطراف." },
      ],
    },
    reglementation: {
      title: "الإطار التنظيمي للذهب",
      subtitle: "مراجع تنظيمية للمناجم والتجار ومكاتب الشراء والمؤسسات والمشترين المهنيين.",
      cards: [
        { title: "تنظيم التعدين", summary: "مبادئ الحوكمة والتراخيص والرقابة والتصريح." },
        { title: "التتبع والتدقيق", summary: "أدلة الأصل وسلسلة الحيازة الموثقة لكل دفعة." },
        { title: "امتثال KYC/AML", summary: "فحص الأطراف ومصدر الأموال والتحقق من الوثائق." },
        { title: "إطار التصدير", summary: "نقاط مراقبة الجودة والوثائق والجمارك قبل الشحن." },
      ],
    },
    industrie: {
      title: "صناعة تعدين الذهب",
      subtitle: "نظرة مهنية على صناعة الذهب الأفريقية مع تركيز على كوت ديفوار.",
      cards: [
        { title: "مناطق الذهب", summary: "مناطق الإنتاج والقدرات والديناميكيات الإقليمية." },
        { title: "أطراف سلسلة القيمة", summary: "المناجم والمحللون والورش وشركاء اللوجستيات وبيوت التوزيع." },
        { title: "التحويل المحلي", summary: "خلق قيمة أفريقية عبر التوثيق والختم والمجوهرات والتوزيع." },
        { title: "ذكاء القطاع", summary: "المخاطر والفرص وإشارات السوق المفيدة للمهنيين." },
      ],
    },
    pro: {
      title: "المساحة المهنية",
      subtitle: "مساحة مخصصة لمهنيي الذهب: المناجم والتجار ومكاتب الشراء والموردين والحرفيين والمشترين بالجملة الخاضعين للمراجعة.",
      cards: [
        { title: "توريد مهني", summary: "وصول منظم إلى أطراف مؤهلة مع وثائق تتبع." },
        { title: "تنفيذ منضبط", summary: "مسارات طلب وتحقق وتسليم مناسبة للعمليات المهنية." },
        { title: "إدارة المخاطر", summary: "أطر امتثال ومصدر أموال ومصدر بضائع وضوابط جودة." },
        { title: "دعم مؤسسي", summary: "مرافقة البيوت والموردين والمشترين المهنيين حسب التوفر والامتثال." },
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
  const { language } = useLocale();
  const copy = getAuthorityTopic(language, "pro");
  return <BdoAuthorityLayout title={copy.title} subtitle={copy.subtitle} cards={copy.cards} />;
}
