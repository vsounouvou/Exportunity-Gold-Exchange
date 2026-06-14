import { Link } from "wouter";
import type { StoreCollection } from "@/types/storefront";
import { useLocale } from "@/contexts/LocaleContext";

const copy = {
  fr: {
    fallbackDescription: "Selection certifiee Bourse de l'Or",
    browse: "Voir la collection",
  },
  en: {
    fallbackDescription: "Certified Bourse de l'Or selection",
    browse: "Browse collection",
  },
  ar: {
    fallbackDescription: "اختيار معتمد من بورصة الذهب",
    browse: "عرض المجموعة",
  },
};

export function CollectionCard({ collection }: { collection: StoreCollection }) {
  const { language } = useLocale();
  const labels = copy[language] || copy.fr;

  return (
    <article className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
      <h3 className="text-sm font-semibold text-white">{collection.name}</h3>
      <p className="mt-1 text-xs text-white/60 line-clamp-2">{collection.description || labels.fallbackDescription}</p>
      <Link href={`/collections/${encodeURIComponent(collection.slug)}`}>
        <span className="mt-3 inline-block text-xs text-amber-300 hover:text-amber-200">{labels.browse}</span>
      </Link>
    </article>
  );
}
