import { Link } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

const footerLabels = {
  fr: {
    compliance: "Cadre & conformité",
    terms: "Conditions",
    privacy: "Confidentialité",
    notice:
      "Les produits et services affichés sont soumis aux restrictions juridictionnelles, contrôles de conformité, disponibilité et confirmation finale. La plateforme peut refuser, retarder ou annuler une transaction qui ne respecte pas les exigences légales, réglementaires, de paiement ou de sourcing responsable.",
  },
  en: {
    compliance: "Compliance framework",
    terms: "Terms",
    privacy: "Privacy",
    notice:
      "Products and services displayed are subject to jurisdictional restrictions, compliance checks, availability, and final confirmation. The platform may refuse, delay, or cancel a transaction that does not meet legal, regulatory, payment, or responsible-sourcing requirements.",
  },
  ar: {
    compliance: "إطار الامتثال",
    terms: "الشروط",
    privacy: "الخصوصية",
    notice:
      "تخضع المنتجات والخدمات المعروضة للقيود القانونية وفحوص الامتثال والتوفر والتأكيد النهائي. قد ترفض المنصة أو تؤخر أو تلغي أي معاملة لا تستوفي المتطلبات القانونية أو التنظيمية أو متطلبات الدفع أو التوريد المسؤول.",
  },
} as const;

export function InstitutionFooter({ className }: { className?: string }) {
  const { brand, tenant } = useTenant();
  const { language } = useLocale();
  const labels = footerLabels[language] ?? footerLabels.fr;
  const isBourseBrand = tenant.key === "bdo";

  return (
    <footer className={cn("border-t border-white/10 bg-black/40 backdrop-blur", className)}>
      <div className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-white/70">
            <span className="font-semibold text-white">{brand.name}</span>
            <span className="text-white/50"> - {brand.tagline}</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/60">
            <Link href="/cadre-conformite" className="hover:text-white">
              {labels.compliance}
            </Link>
            <Link href="/terms" className="hover:text-white">
              {labels.terms}
            </Link>
            <Link href="/privacy" className="hover:text-white">
              {labels.privacy}
            </Link>
          </div>
        </div>
        {isBourseBrand ? <p className="mt-3 text-[11px] leading-relaxed text-white/45">{labels.notice}</p> : null}
      </div>
    </footer>
  );
}
