import { Link } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useTenantBrand } from "@/lib/tenant";
import { cn } from "@/lib/utils";

const footerLabels = {
  fr: {
    compliance: "Cadre & conformite",
    terms: "Conditions",
    privacy: "Confidentialite",
    notice:
      "Les produits et services affiches sur cette plateforme sont soumis aux restrictions juridictionnelles, controles de conformite, disponibilite et confirmation finale. La Bourse de l'Or se reserve le droit de refuser ou d'annuler toute transaction qui ne respecte pas les standards legaux, reglementaires, de conformite, de paiement ou de sourcing.",
  },
  en: {
    compliance: "Compliance framework",
    terms: "Terms",
    privacy: "Privacy",
    notice:
      "Products and services displayed on this platform are subject to jurisdictional restrictions, compliance checks, availability, and final confirmation. La Bourse de l'Or reserves the right to refuse or cancel any transaction that does not meet legal, regulatory, compliance, payment, or sourcing standards.",
  },
  ar: {
    compliance: "إطار الامتثال",
    terms: "الشروط",
    privacy: "الخصوصية",
    notice:
      "تخضع المنتجات والخدمات المعروضة على هذه المنصة للقيود القانونية وفحوصات الامتثال والتوفر والتأكيد النهائي. تحتفظ La Bourse de l'Or بحق رفض أو إلغاء أي معاملة لا تستوفي المعايير القانونية أو التنظيمية أو معايير الامتثال أو الدفع أو التوريد.",
  },
} as const;

export function InstitutionFooter({ className }: { className?: string }) {
  const brand = useTenantBrand();
  const { language } = useLocale();
  const labels = footerLabels[language] ?? footerLabels.fr;
  const isBourseBrand = /bourse de l'?or/i.test(brand.name);

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
