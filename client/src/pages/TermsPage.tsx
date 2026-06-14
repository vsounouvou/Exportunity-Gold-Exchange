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
          "La Bourse de l'Or est une plateforme digitale structurée qui connecte les clients à des produits en or physique certifié, des lingots issus de raffineries, des pièces ou lingots documentés, des bijoux vérifiés et des partenaires de production approuvés.",
      },
      {
        title: "Nature des produits",
        body:
          "Les produits présentés peuvent être des lingots produits par raffinerie, des lingots ou pièces d'or certifiés, des bijoux ou pièces de collection sur commande, ou des produits fournis par des partenaires approuvés.",
      },
      {
        title: "Prix et frais",
        body:
          "Les prix peuvent fluctuer selon le cours international de l'or, le poids, le titre, les coûts de raffinage, les primes, les frais de plateforme, le traitement de paiement, la livraison, l'assurance, les taxes, les droits, les options de stockage et les conditions locales du marché. Le prix affiché peut rester indicatif jusqu'à confirmation finale.",
      },
      {
        title: "Commandes et paiement",
        body:
          "Une commande n'est exécutée qu'après confirmation des informations requises, actualisation du prix lorsque nécessaire, revue des règles applicables et validation du paiement par les prestataires concernés.",
      },
      {
        title: "Raffineries et partenaires approuvés",
        body:
          "Certains lingots peuvent être fournis directement par des raffineries approuvées ou des partenaires liés à une raffinerie. Dans ce cas, La Bourse de l'Or facilite la commande digitale, la communication client, la coordination du paiement, la documentation et les options de livraison ou de stockage.",
      },
      {
        title: "Vérification et conformité",
        body:
          "Tous les produits en or sont soumis à disponibilité, vérification, revue de conformité et confirmation du paiement. La Bourse de l'Or peut demander des documents KYC/KYB, de source des fonds, de source des biens ou de traçabilité avant de confirmer certaines transactions.",
      },
      {
        title: "Sourcing responsable",
        body:
          "La plateforme ne soutient pas le commerce d'or illégal, non documenté, lié à un conflit ou non conforme. Tout approvisionnement doit respecter les principes de sourcing responsable, AML, sanctions et traçabilité.",
      },
      {
        title: "Disponibilité, confirmation et propriété",
        body:
          "Le transfert de propriété intervient uniquement après paiement complet, validation de conformité et confirmation finale par La Bourse de l'Or ou par le fournisseur, partenaire raffinerie ou partenaire de production approuvé concerné.",
      },
      {
        title: "Livraison, retrait et stockage",
        body:
          "Les clients peuvent choisir, lorsque disponible, la livraison, le retrait ou le stockage sécurisé. Les délais dépendent de la disponibilité, du temps de production, des contrôles de conformité, de la confirmation du paiement, de la logistique, des douanes et des réglementations locales.",
      },
      {
        title: "Conservation sécurisée",
        body:
          "Les conditions de stockage, le dépositaire, la couverture d'assurance, les frais, les conditions de retrait et les procédures de transfert doivent être confirmés séparément avant l'activation du service.",
      },
      {
        title: "Bijoux et pièces sur commande",
        body:
          "Pour les bijoux et pièces de collection sur commande, la plateforme transmet les détails de commande au partenaire de production approuvé. Une fois la production terminée, le partenaire confirme la disponibilité par validation interne, puis le client est informé.",
      },
      {
        title: "Annulation et remboursement",
        body:
          "Les commandes impliquant un verrouillage du prix de l'or, une production sur mesure, une allocation raffinerie ou un approvisionnement spécial peuvent ne plus être annulables après confirmation. Les conditions de remboursement et d'annulation doivent être clairement confirmées avant le paiement.",
      },
      {
        title: "Limites de responsabilité",
        body:
          "La Bourse de l'Or ne fournit pas de conseil financier, d'investissement, fiscal ou juridique. Les achats d'or comportent un risque de fluctuation du prix. La plateforme n'est pas une banque, un fonds d'investissement, une bourse de valeurs, un service de transfert d'argent, une plateforme crypto ou un conseiller financier réglementé.",
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
          "La Bourse de l'Or is a structured digital platform connecting customers to certified physical gold products, refinery-produced bullion, documented bars or coins, verified jewelry, and approved production partners.",
      },
      {
        title: "Product types",
        body:
          "Products may include refinery-produced bullion, certified gold bars or coins, made-to-order jewelry or collectible pieces, and products supplied through approved partners.",
      },
      {
        title: "Prices and fees",
        body:
          "Prices may fluctuate according to international gold prices, weight, purity, refining costs, premiums, platform fees, payment processing, delivery, insurance, taxes, duties, selected storage options, and local market conditions. Displayed prices may remain indicative until final confirmation.",
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
          "All gold products are subject to availability, verification, compliance review, and payment confirmation. La Bourse de l'Or may request KYC/KYB documents, source of funds, source of goods, or traceability evidence before confirming certain transactions.",
      },
      {
        title: "Responsible sourcing",
        body:
          "The platform does not support illegal, undocumented, conflict-related, or non-compliant gold trade. All sourcing must follow responsible sourcing, AML, sanctions, and traceability principles.",
      },
      {
        title: "Availability, confirmation, and ownership",
        body:
          "Ownership transfer occurs only after full payment, compliance validation, and final confirmation by La Bourse de l'Or or the relevant approved supplier, refinery partner, or production partner.",
      },
      {
        title: "Delivery, collection, and storage",
        body:
          "Customers may choose, where available, delivery, collection, or secure storage. Delivery times depend on product availability, production time, compliance checks, payment confirmation, logistics, customs, and local regulations.",
      },
      {
        title: "Secure custody",
        body:
          "Storage terms, custody provider, insurance coverage, fees, withdrawal conditions, and transfer procedures must be confirmed separately before the service becomes active.",
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
          "La Bourse de l'Or does not provide financial, investment, tax, or legal advice. Gold purchases involve price fluctuation risk. The platform is not a bank, investment fund, securities exchange, money-transfer service, crypto platform, or regulated financial adviser.",
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
          "لا بورص دو لور منصة رقمية منظمة تربط العملاء بمنتجات ذهب مادي موثقة، وسبائك مرتبطة بمصاف معتمدة، وقطع أو سبائك موثقة، ومجوهرات متحقق منها، وشركاء إنتاج معتمدين.",
      },
      {
        title: "أنواع المنتجات",
        body:
          "قد تشمل المنتجات سبائك منتجة من مصاف، أو سبائك وقطع ذهبية موثقة، أو مجوهرات وقطع مجموعة مصنوعة حسب الطلب، أو منتجات يوفرها شركاء معتمدون.",
      },
      {
        title: "الأسعار والرسوم",
        body:
          "قد تتغير الأسعار حسب السعر الدولي للذهب والوزن والعيار وتكاليف التصفية والعلاوات ورسوم المنصة ومعالجة الدفع والتسليم والتأمين والضرائب والرسوم وخيارات التخزين وظروف السوق المحلية. وقد يبقى السعر المعروض إرشادياً حتى التأكيد النهائي.",
      },
      {
        title: "الطلبات والدفع",
        body:
          "لا يتم تنفيذ الطلب إلا بعد تأكيد المعلومات المطلوبة وتحديث السعر عند الحاجة ومراجعة القواعد المطبقة والتحقق من الدفع عبر الجهات المعنية.",
      },
      {
        title: "المصافي والشركاء المعتمدون",
        body:
          "قد يتم توريد بعض منتجات السبائك مباشرة من مصاف معتمدة أو شركاء مرتبطين بالمصافي. في هذه الحالة تسهل لا بورص دو لور الطلب الرقمي والتواصل مع العميل وتنسيق الدفع والتوثيق وخيارات التسليم أو التخزين.",
      },
      {
        title: "التحقق والامتثال",
        body:
          "تخضع كل منتجات الذهب للتوفر والتحقق ومراجعة الامتثال وتأكيد الدفع. قد تطلب لا بورص دو لور وثائق KYC/KYB أو مصدر الأموال أو مصدر البضائع أو أدلة التتبع قبل تأكيد بعض المعاملات.",
      },
      {
        title: "التوريد المسؤول",
        body:
          "لا تدعم المنصة تجارة الذهب غير القانونية أو غير الموثقة أو المرتبطة بالنزاعات أو غير الممتثلة. يجب أن يتبع كل توريد مبادئ التوريد المسؤول ومكافحة غسل الأموال والعقوبات والتتبع.",
      },
      {
        title: "التوفر والتأكيد والملكية",
        body:
          "ينتقل حق الملكية فقط بعد السداد الكامل والتحقق من الامتثال والتأكيد النهائي من لا بورص دو لور أو المورد أو شريك المصفاة أو شريك الإنتاج المعتمد ذي الصلة.",
      },
      {
        title: "التسليم والاستلام والتخزين",
        body:
          "يمكن للعملاء، حيثما توفر ذلك، اختيار التسليم أو الاستلام أو التخزين الآمن. تعتمد المواعيد على توفر المنتج ووقت الإنتاج وفحوص الامتثال وتأكيد الدفع واللوجستيات والجمارك والقوانين المحلية.",
      },
      {
        title: "الحفظ الآمن",
        body:
          "يجب تأكيد شروط التخزين ومزود الحفظ والتأمين والرسوم وشروط السحب وإجراءات التحويل بشكل منفصل قبل تفعيل الخدمة.",
      },
      {
        title: "المجوهرات والقطع حسب الطلب",
        body:
          "بالنسبة للمجوهرات والقطع المجموعة المصنوعة حسب الطلب، تنقل المنصة تفاصيل الطلب إلى شريك إنتاج معتمد. بعد اكتمال الإنتاج، يؤكد الشريك الجاهزية من خلال تحقق داخلي ثم يتم إعلام العميل.",
      },
      {
        title: "الإلغاء والاسترداد",
        body:
          "قد لا تكون الطلبات المرتبطة بتثبيت سعر الذهب أو الإنتاج المخصص أو تخصيص المصفاة أو التوريد الخاص قابلة للإلغاء بعد التأكيد. يجب تأكيد شروط الاسترداد والإلغاء بوضوح قبل الدفع.",
      },
      {
        title: "حدود المسؤولية",
        body:
          "لا تقدم لا بورص دو لور نصائح مالية أو استثمارية أو ضريبية أو قانونية. شراء الذهب ينطوي على مخاطر تغير السعر. المنصة ليست بنكاً أو صندوق استثمار أو بورصة أوراق مالية أو خدمة تحويل أموال أو منصة عملات رقمية أو مستشاراً مالياً مرخصاً.",
      },
      {
        title: "شركاء مستقلون",
        body:
          "تبقى المصافي والموردون والحرفيون ومقدمو الخدمات اللوجستية وشركاء الحفظ المعتمدون جهات مستقلة. تنسق لا بورص دو لور تجربة العميل لكنها قد تعتمد على أطراف ثالثة للإنتاج أو التصفية أو الفحص أو التخزين أو اللوجستيات أو التسليم.",
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
