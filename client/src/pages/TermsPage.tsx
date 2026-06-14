import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, FileSignature } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import { BrandLockup, InstitutionFooter } from "@pkg/branding";
import { formatPageTitle } from "@/lib/brand";
import { useTenant } from "@/lib/tenant";

const copy = {
  fr: {
    back: "Accueil",
    title: "Conditions d'utilisation",
    subtitle: "Cadre d'utilisation de la plateforme",
    sections: [
      {
        title: "Objet du service",
        body:
          "La plateforme présente des produits en or physique certifié, des bijoux vérifiés, des demandes de cotation, des parcours professionnels et des services de vérification documentaire.",
      },
      {
        title: "Prix et frais",
        body:
          "Les prix peuvent varier selon le cours de l'or, le poids, le titre, la disponibilité, les frais de plateforme, le traitement de paiement, la livraison, l'assurance, les taxes, les droits et les options de conservation sélectionnées.",
      },
      {
        title: "Commandes et paiement",
        body:
          "Une commande n'est exécutée qu'après confirmation des informations requises, actualisation du prix lorsque nécessaire, vérification des règles applicables et validation du paiement par les prestataires concernés.",
      },
      {
        title: "Raffineries et partenaires approuvés",
        body:
          "Certains lingots peuvent être fournis directement par des raffineries approuvées ou des partenaires liés à une raffinerie. Dans ce cas, La Bourse de l'Or facilite la commande digitale, la communication client, la coordination du paiement, la documentation et les options de livraison ou de stockage.",
      },
      {
        title: "Vérification et conformité",
        body:
          "Certaines opérations peuvent demander une vérification d'identité, d'entreprise, de source de fonds, de source de biens ou de documents. Une revue humaine peut être requise avant activation de certaines fonctions.",
      },
      {
        title: "Disponibilité, confirmation et propriété",
        body:
          "Tous les produits en or sont soumis à disponibilité, vérification, revue de conformité et confirmation du paiement. Le transfert de propriété intervient uniquement après paiement complet, validation de conformité et confirmation finale par La Bourse de l'Or ou le fournisseur, partenaire raffinerie ou artisan approuvé concerné.",
      },
      {
        title: "Livraison, retrait et conservation",
        body:
          "Les modalités de livraison, retrait ou conservation dépendent du produit, de la zone, du partenaire logistique, des contraintes douanières et des contrôles de disponibilité. Les délais dépendent aussi du temps de production, des contrôles de conformité, de la confirmation du paiement et des règles locales.",
      },
      {
        title: "Stockage et conservation",
        body:
          "Lorsque disponible, le client peut choisir la livraison, le retrait ou un stockage sécurisé. Les conditions de stockage, le dépositaire, l'assurance, les frais, les conditions de retrait et les procédures de transfert doivent être confirmés séparément avant activation du service.",
      },
      {
        title: "Bijoux et pièces sur commande",
        body:
          "Pour les bijoux et pièces de collection sur commande, la plateforme transmet les détails de commande au partenaire de production approuvé. Une fois la production terminée, le partenaire confirme la disponibilité par validation interne, puis le client est informé.",
      },
      {
        title: "Annulation et remboursement",
        body:
          "Les commandes impliquant un verrouillage du prix de l'or, une production sur mesure, une allocation raffinerie ou un approvisionnement spécial peuvent ne plus être annulables après confirmation. Les conditions de remboursement et d'annulation doivent être confirmées avant le paiement.",
      },
      {
        title: "Limites de responsabilité",
        body:
          "La plateforme facilite la présentation, la documentation, la vérification et la coordination. Elle ne fournit pas de conseil financier, d'investissement, fiscal ou juridique, ne promet aucun rendement, aucune liquidité instantanée, aucun rachat garanti et ne remplace pas une analyse indépendante.",
      },
      {
        title: "Partenaires indépendants",
        body:
          "Les raffineries, fournisseurs, artisans, prestataires logistiques et partenaires de stockage approuvés restent des opérateurs indépendants. La Bourse de l'Or coordonne l'expérience client mais peut s'appuyer sur des tiers pour la production, l'affinage, l'essai, le stockage, la logistique ou la livraison.",
      },
    ],
  },
  en: {
    back: "Home",
    title: "Terms of use",
    subtitle: "Platform use framework",
    sections: [
      {
        title: "Service scope",
        body:
          "The platform presents certified physical gold, verified jewelry, quote requests, professional workflows, and document verification services.",
      },
      {
        title: "Prices and fees",
        body:
          "Prices may vary based on the gold market price, weight, purity, availability, platform spread, payment processing, delivery, insurance, taxes, duties, and selected custody options.",
      },
      {
        title: "Orders and payment",
        body:
          "An order is executed only after required information is confirmed, price is refreshed when needed, applicable rules are reviewed, and payment is validated by the relevant providers.",
      },
      {
        title: "Approved refineries and partners",
        body:
          "Certain bullion products may be supplied directly from approved refineries or refinery-linked partners. In such cases, La Bourse de l'Or facilitates the digital order process, customer communication, payment coordination, documentation, and delivery or storage options.",
      },
      {
        title: "Verification and compliance",
        body:
          "Some operations may require identity, business, source of funds, source of goods, or document verification. Human review may be required before certain functions are enabled.",
      },
      {
        title: "Availability, confirmation, and ownership",
        body:
          "All gold products are subject to availability, verification, compliance review, and payment confirmation. Ownership transfer occurs only after full payment, compliance validation, and final confirmation by La Bourse de l'Or or the relevant approved supplier, refinery partner, or production partner.",
      },
      {
        title: "Delivery, pickup, and custody",
        body:
          "Delivery, pickup, or custody terms depend on the product, area, logistics partner, customs constraints, availability checks, production time, payment confirmation, and local regulations.",
      },
      {
        title: "Storage and custody",
        body:
          "Where available, customers may choose delivery, collection, or secure storage. Storage terms, custody provider, insurance coverage, fees, withdrawal conditions, and transfer procedures must be confirmed separately before the service becomes active.",
      },
      {
        title: "Made-to-order jewelry and collectible pieces",
        body:
          "For made-to-order jewelry and collectible pieces, the platform transmits order details to the approved production partner. Once production is completed, the partner confirms readiness through internal validation, after which the customer is informed.",
      },
      {
        title: "Cancellation and refunds",
        body:
          "Orders involving gold price locking, custom production, refinery allocation, or special procurement may not be cancellable once confirmed. Refund and cancellation terms must be clearly confirmed before checkout.",
      },
      {
        title: "Limitations",
        body:
          "The platform supports presentation, documentation, verification, and coordination. It does not provide financial, investment, tax, or legal advice, and does not promise returns, instant liquidity, or guaranteed buyback.",
      },
      {
        title: "Independent partners",
        body:
          "Approved refineries, suppliers, artisans, logistics providers, and vaulting partners remain independent operators. La Bourse de l'Or coordinates the customer experience but may rely on third parties for production, refining, assay, storage, logistics, or delivery.",
      },
    ],
  },
  ar: {
    back: "الرئيسية",
    title: "شروط الاستخدام",
    subtitle: "إطار استخدام المنصة",
    sections: [
      {
        title: "نطاق الخدمة",
        body:
          "تعرض المنصة الذهب المادي المعتمد والمجوهرات الموثقة وطلبات التسعير والمسارات المهنية وخدمات التحقق من الوثائق.",
      },
      {
        title: "الأسعار والرسوم",
        body:
          "قد تختلف الأسعار حسب سعر سوق الذهب والوزن والنقاء والتوفر وهامش المنصة ورسوم معالجة الدفع والتسليم والتأمين والضرائب والرسوم وخيارات الحفظ المختارة.",
      },
      {
        title: "الطلبات والدفع",
        body:
          "لا يتم تنفيذ الطلب إلا بعد تأكيد المعلومات المطلوبة وتحديث السعر عند الحاجة ومراجعة القواعد المعمول بها والتحقق من الدفع عبر الجهات المعنية.",
      },
      {
        title: "التحقق والامتثال",
        body:
          "قد تتطلب بعض العمليات التحقق من الهوية أو الشركة أو مصدر الأموال أو مصدر البضائع أو الوثائق. وقد تكون المراجعة البشرية مطلوبة قبل تفعيل بعض الوظائف.",
      },
      {
        title: "التسليم والاستلام والحفظ",
        body:
          "تعتمد شروط التسليم أو الاستلام أو الحفظ على المنتج والمنطقة والشريك اللوجستي والقيود الجمركية وفحوصات التوفر.",
      },
      {
        title: "الحدود",
        body:
          "تدعم المنصة العرض والتوثيق والتحقق والتنسيق. ولا تعد بعوائد أو سيولة فورية أو إعادة شراء مضمونة، ولا تحل محل المشورة القانونية أو الضريبية أو المالية المستقلة.",
      },
    ],
  },
} as const;

export function TermsPage() {
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
          <BrandLockup subtitle={text.subtitle} />
          <div className="w-14" />
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card className="bg-gray-900/60 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-amber-400" />
                {text.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-white/70 space-y-5">
              {text.sections.map((section) => (
                <section key={section.title} className="space-y-1">
                  <h2 className="font-semibold text-white">{section.title}</h2>
                  <p>{section.body}</p>
                </section>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>

      <InstitutionFooter />
    </div>
  );
}

export default TermsPage;
