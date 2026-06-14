import type { StoreProduct } from "@/types/storefront";
import { ProductCard } from "./ProductCard";
import { useLocale } from "@/contexts/LocaleContext";

const emptyLabels = {
  fr: "Aucun produit disponible pour cette selection.",
  en: "No products available in this selection.",
  ar: "لا توجد منتجات متاحة في هذا الاختيار.",
};

export function ProductGrid({ items }: { items: StoreProduct[] }) {
  const { language } = useLocale();

  if (!items.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">
        {emptyLabels[language] || emptyLabels.fr}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <ProductCard key={item.id} product={item} />
      ))}
    </div>
  );
}
