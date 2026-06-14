import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import { BrandLockup, InstitutionFooter } from "@pkg/branding";
import { formatPageTitle } from "@/lib/brand";
import { useTenant } from "@/lib/tenant";

const copy = {
  fr: {
    back: "Accueil",
    title: "Cadre & conformité",
    intro:
      "L'accès à certaines opérations est soumis à des contrôles d'identité, d'entreprise, de risque, de provenance et de documentation.",
    cards: [
      {
        title: "Vérification KYC / KYB",
        body: [
          "Les acheteurs, fournisseurs et partenaires professionnels peuvent devoir fournir des informations d'identité ou d'entreprise.",
          "La plateforme peut demander des justificatifs avant d'activer le paiement final, la livraison, le stockage, la conservation ou les parcours de gros.",
        ],
      },
      {
        title: "Contrôle des transactions",
        body: [
          "Les commandes d'or physique certifié, bijoux vérifiés, produits de raffinerie et demandes professionnelles peuvent faire l'objet d'une revue humaine.",
          "Les prix, frais de traitement, livraison, assurance, taxes, droits et conditions de disponibilité sont présentés avant confirmation lorsque ces éléments sont applicables.",
          "Une transaction peut être refusée, retardée ou annulée si les exigences légales, réglementaires, de paiement, de conformité ou de sourcing ne sont pas remplies.",
        ],
      },
      {
        title: "Origine, documents et traçabilité",
        body: [
          "Les informations disponibles peuvent inclure photos, poids, titre, origine déclarée, documents fournisseur, documents raffinerie et certificat de vérification.",
          "La certification numérique documente les éléments vérifiés au moment du contrôle; elle ne remplace pas une due diligence indépendante lorsqu'elle est requise.",
          "La Bourse de l'Or ne soutient pas le commerce d'or illégal, non documenté, lié à un conflit ou non conforme. Tout sourcing doit respecter les principes de sourcing responsable, AML, sanctions et traçabilité.",
        ],
      },
      {
        title: "Production, livraison et stockage",
        body: [
          "Les produits peuvent provenir d'une raffinerie approuvée, d'un fournisseur, d'un producteur ou d'un artisan partenaire.",
          "Les délais dépendent de la disponibilité, du temps de production, des contrôles de conformité, de la confirmation du paiement, de la logistique, des douanes et des règles locales.",
          "Les services de stockage ou de conservation nécessitent une confirmation séparée du dépositaire, de l'assurance, des frais, des conditions de retrait et des procédures de transfert.",
        ],
      },
      {
        title: "Revue humaine",
        body: [
          "Toute décision sensible peut être escaladée à un opérateur ou à un partenaire de conformité.",
          "Un compte, une commande ou une demande professionnelle peut être limité, suspendu ou refusé si les informations sont insuffisantes ou incohérentes.",
        ],
      },
    ],
    linksTitle: "Documents utiles",
    terms: "Conditions d'utilisation",
    privacy: "Politique de confidentialité",
  },
  en: {
    back: "Home",
    title: "Compliance framework",
    intro:
      "Access to certain operations may require identity, business, risk, provenance, and documentation checks.",
    cards: [
      {
        title: "KYC / KYB verification",
        body: [
          "Buyers, suppliers, and professional partners may need to provide identity or business information.",
          "The platform may request supporting documents before final payment, delivery, storage, custody, or wholesale workflows are enabled.",
        ],
      },
      {
        title: "Transaction controls",
        body: [
          "Certified physical gold orders, verified jewelry, refinery products, and professional requests may be subject to human review.",
          "Product price, processing fees, delivery, insurance, taxes, duties, and availability conditions are shown before confirmation when applicable.",
          "A transaction may be refused, delayed, or cancelled if legal, regulatory, payment, compliance, or sourcing requirements are not met.",
        ],
      },
      {
        title: "Origin, documents, and traceability",
        body: [
          "Available records may include photos, weight, purity, declared origin, supplier documents, refinery documents, and verification certificates.",
          "Digital certification documents the elements verified at the time of review; it does not replace independent due diligence when required.",
          "La Bourse de l'Or does not support illegal, undocumented, conflict-related, or non-compliant gold trade. All sourcing must follow responsible sourcing, AML, sanctions, and traceability principles.",
        ],
      },
      {
        title: "Production, delivery, and storage",
        body: [
          "Products may come from an approved refinery, supplier, producer, or artisan partner.",
          "Delivery times depend on product availability, production time, compliance checks, payment confirmation, logistics, customs, and local regulations.",
          "Storage or custody services require separate confirmation of the custody provider, insurance, fees, withdrawal conditions, and transfer procedures.",
        ],
      },
      {
        title: "Human review",
        body: [
          "Every sensitive decision can be escalated to an operator or compliance partner.",
          "An account, order, or professional request may be limited, suspended, or refused if information is incomplete or inconsistent.",
        ],
      },
    ],
    linksTitle: "Useful documents",
    terms: "Terms of use",
    privacy: "Privacy policy",
  },
  ar: {
    back: "الرئيسية",
    title: "إطار الامتثال",
    intro:
      "قد يتطلب الوصول إلى بعض العمليات التحقق من الهوية أو الشركة أو المخاطر أو المصدر أو الوثائق.",
    cards: [
      {
        title: "التحقق من الهوية والشركات",
        body: [
          "قد يطلب من المشترين والموردين والشركاء المهنيين تقديم معلومات هوية أو معلومات شركة.",
          "قد تطلب المنصة وثائق داعمة قبل تفعيل الدفع النهائي أو التسليم أو التخزين أو الحفظ أو مسارات الجملة.",
        ],
      },
      {
        title: "مراجعة المعاملات",
        body: [
          "قد تخضع طلبات الذهب المادي الموثق والمجوهرات المتحقق منها ومنتجات المصافي والطلبات المهنية لمراجعة بشرية.",
          "يتم عرض سعر المنتج ورسوم المعالجة والتسليم والتأمين والضرائب والرسوم وشروط التوفر قبل التأكيد عند الاقتضاء.",
          "قد يتم رفض أو تأخير أو إلغاء المعاملة إذا لم تستوف المتطلبات القانونية أو التنظيمية أو متطلبات الدفع أو الامتثال أو التوريد.",
        ],
      },
      {
        title: "الأصل والوثائق والتتبع",
        body: [
          "قد تشمل السجلات المتاحة الصور والوزن والعيار والأصل المعلن ووثائق المورد ووثائق المصفاة وشهادات التحقق.",
          "توثق الشهادة الرقمية العناصر التي تم التحقق منها وقت المراجعة؛ ولا تحل محل العناية الواجبة المستقلة عند الحاجة.",
          "لا تدعم لا بورص دو لور تجارة الذهب غير القانونية أو غير الموثقة أو المرتبطة بالنزاعات أو غير الممتثلة. يجب أن يتبع كل توريد مبادئ التوريد المسؤول ومكافحة غسل الأموال والعقوبات والتتبع.",
        ],
      },
      {
        title: "الإنتاج والتسليم والتخزين",
        body: [
          "قد تأتي المنتجات من مصفاة معتمدة أو مورد أو منتج أو حرفي شريك.",
          "تعتمد مواعيد التسليم على توفر المنتج ووقت الإنتاج وفحوص الامتثال وتأكيد الدفع واللوجستيات والجمارك والقوانين المحلية.",
          "تتطلب خدمات التخزين أو الحفظ تأكيداً منفصلاً لمزود الحفظ والتأمين والرسوم وشروط السحب وإجراءات التحويل.",
        ],
      },
      {
        title: "مراجعة بشرية",
        body: [
          "يمكن تصعيد كل قرار حساس إلى مشغل أو شريك امتثال.",
          "قد يتم تقييد أو تعليق أو رفض حساب أو طلب أو طلب مهني إذا كانت المعلومات ناقصة أو غير متسقة.",
        ],
      },
    ],
    linksTitle: "مستندات مفيدة",
    terms: "شروط الاستخدام",
    privacy: "سياسة الخصوصية",
  },
} as const;

export function CompliancePage() {
  const { brand } = useTenant();
  const { language } = useLocale();
  const text = copy[language] ?? copy.fr;

  useEffect(() => {
    document.title = formatPageTitle(text.title, brand);
  }, [brand, text.title]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col" dir={language === "ar" ? "rtl" : "ltr"}>
      <header className="border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            {text.back}
          </Link>
          <BrandLockup subtitle={text.title} />
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
              <h1 className="text-2xl font-semibold text-white">{text.title}</h1>
              <p className="text-sm text-white/60">{text.intro}</p>
            </div>
          </div>

          {text.cards.map((card) => (
            <Card key={card.title} className="bg-gray-900/60 border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">{card.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-white/70 space-y-2">
                {card.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </CardContent>
            </Card>
          ))}

          <Card className="bg-gray-900/60 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg">{text.linksTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/terms" className="text-amber-400 hover:text-amber-300">
                {text.terms}
              </Link>
              <Link href="/privacy" className="text-amber-400 hover:text-amber-300">
                {text.privacy}
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>

      <InstitutionFooter />
    </div>
  );
}

export default CompliancePage;
