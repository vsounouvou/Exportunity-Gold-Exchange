import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import { BrandLockup, InstitutionFooter } from "@pkg/branding";
import { formatPageTitle } from "@/lib/brand";
import { useTenant } from "@/lib/tenant";

const copy = {
  fr: {
    back: "Accueil",
    title: "Politique de confidentialité",
    subtitle: "Données, documents et sécurité",
    sections: [
      {
        title: "Données collectées",
        body:
          "Nous collectons les informations nécessaires à la navigation, aux demandes de cotation, aux commandes, au support, à la vérification de certificat, à la livraison et aux contrôles de conformité.",
      },
      {
        title: "Documents de vérification",
        body:
          "Les pièces d'identité, documents d'entreprise, preuves d'origine, photos, certificats et justificatifs sont utilisés pour l'évaluation de conformité, la sécurité opérationnelle et le traitement des demandes.",
      },
      {
        title: "Utilisation des données",
        body:
          "Les données servent à gérer les comptes, vérifier les produits, préparer les commandes, traiter les paiements, organiser la livraison, documenter la traçabilité et répondre aux demandes.",
      },
      {
        title: "Confidentialité des commandes",
        body:
          "Les détails de commande, documents d'identité, informations de paiement et communications avec les fournisseurs, raffineries, artisans, logisticiens ou partenaires de stockage sont traités comme confidentiels et utilisés uniquement pour le traitement des commandes, la conformité, la logistique et le support client.",
      },
      {
        title: "Protection et accès",
        body:
          "L'accès aux informations sensibles est limité aux personnes et prestataires autorisés lorsque cela est nécessaire à la vérification, au paiement, à la production, à la livraison, au stockage, à la conformité ou au support. Les documents de conformité ne doivent pas être exposés publiquement.",
      },
      {
        title: "Conservation",
        body:
          "Les informations sont conservées pendant la durée nécessaire aux opérations, obligations de conformité, suivi des commandes, résolution des litiges et exigences légales applicables.",
      },
      {
        title: "Vos droits",
        body:
          "Vous pouvez demander l'accès, la correction ou la suppression de certaines données lorsque la loi le permet. Certaines informations peuvent devoir être conservées pour des obligations légales ou de sécurité.",
      },
    ],
  },
  en: {
    back: "Home",
    title: "Privacy policy",
    subtitle: "Data, documents, and security",
    sections: [
      {
        title: "Data collected",
        body:
          "We collect the information needed for browsing, quote requests, orders, support, certificate verification, delivery, and compliance checks.",
      },
      {
        title: "Verification documents",
        body:
          "Identity documents, company records, origin evidence, photos, certificates, and supporting files are used for compliance review, operational security, and request processing.",
      },
      {
        title: "Data use",
        body:
          "Data is used to manage accounts, verify products, prepare orders, process payments, organize delivery, document traceability, and respond to requests.",
      },
      {
        title: "Order confidentiality",
        body:
          "Customer order details, identity documents, payment information, and communications with suppliers, refineries, artisans, logistics providers, or vaulting partners are treated as confidential and used only for order processing, compliance, logistics, and customer support.",
      },
      {
        title: "Protection and access",
        body:
          "Access to sensitive information is limited to authorized people and service providers when needed for verification, payment, production, delivery, storage, compliance, or support. Compliance documents must not be exposed publicly.",
      },
      {
        title: "Retention",
        body:
          "Information is retained for the time needed for operations, compliance obligations, order follow-up, dispute resolution, and applicable legal requirements.",
      },
      {
        title: "Your rights",
        body:
          "You may request access, correction, or deletion of certain data where permitted by law. Some information may need to be retained for legal or security obligations.",
      },
    ],
  },
  ar: {
    back: "الرئيسية",
    title: "سياسة الخصوصية",
    subtitle: "البيانات والوثائق والأمان",
    sections: [
      {
        title: "البيانات التي يتم جمعها",
        body:
          "نجمع المعلومات اللازمة للتصفح وطلبات التسعير والطلبات والدعم والتحقق من الشهادات والتسليم وفحوصات الامتثال.",
      },
      {
        title: "وثائق التحقق",
        body:
          "تستخدم وثائق الهوية وسجلات الشركة وأدلة الأصل والصور والشهادات والملفات الداعمة للمراجعة الامتثالية والأمان التشغيلي ومعالجة الطلبات.",
      },
      {
        title: "استخدام البيانات",
        body:
          "تستخدم البيانات لإدارة الحسابات والتحقق من المنتجات وتجهيز الطلبات ومعالجة المدفوعات وتنظيم التسليم وتوثيق التتبع والرد على الطلبات.",
      },
      {
        title: "الحماية والوصول",
        body:
          "يقتصر الوصول إلى المعلومات الحساسة على الأشخاص ومقدمي الخدمات المصرح لهم. ويجب عدم عرض وثائق الامتثال علنا.",
      },
      {
        title: "الاحتفاظ",
        body:
          "يتم الاحتفاظ بالمعلومات للفترة اللازمة للعمليات والالتزامات الامتثالية ومتابعة الطلبات وحل النزاعات والمتطلبات القانونية المعمول بها.",
      },
      {
        title: "حقوقك",
        body:
          "يمكنك طلب الوصول إلى بعض البيانات أو تصحيحها أو حذفها عندما يسمح القانون بذلك. وقد يلزم الاحتفاظ ببعض المعلومات لالتزامات قانونية أو أمنية.",
      },
    ],
  },
} as const;

export function PrivacyPage() {
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
                <Shield className="h-5 w-5 text-amber-400" />
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

export default PrivacyPage;
