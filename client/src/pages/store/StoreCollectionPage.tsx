import { useQuery } from "@tanstack/react-query";

import { ProductGrid } from "@/components/storefront/ProductGrid";
import { useLocale } from "@/contexts/LocaleContext";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import type { StoreProduct } from "@/types/storefront";

const copy = {
  fr: {
    defaultDescription: "Sélection BOURSE DE L'OR documentée, vérifiable et soumise à confirmation finale.",
    loading: "Chargement de la collection...",
    brand: "BOURSE DE L'OR",
    caption:
      "Produits en or physique, bijoux vérifiés ou pièces sur commande. Les prix peuvent rester indicatifs jusqu'à validation de disponibilité, paiement et conformité.",
  },
  en: {
    defaultDescription: "Documented, verifiable BOURSE DE L'OR selection subject to final confirmation.",
    loading: "Loading collection...",
    brand: "BOURSE DE L'OR",
    caption:
      "Physical gold products, verified jewelry, or made-to-order pieces. Prices may remain indicative until availability, payment, and compliance are validated.",
  },
  ar: {
    defaultDescription: "اختيار موثق وقابل للتحقق من BOURSE DE L'OR وخاضع للتأكيد النهائي.",
    loading: "جارٍ تحميل المجموعة...",
    brand: "BOURSE DE L'OR",
    caption:
      "منتجات ذهب مادي أو مجوهرات متحقق منها أو قطع حسب الطلب. قد تبقى الأسعار إرشادية حتى تأكيد التوفر والدفع والامتثال.",
  },
};

export default function StoreCollectionPage({ slug }: { slug: string }) {
  const { language } = useLocale();
  const { tenant } = useTenant();
  const labels = copy[language] || copy.fr;
  const query = useQuery({
    queryKey: ["store", "collection", slug],
    queryFn: async () => apiRequest(`/api/store/collections/${encodeURIComponent(slug)}`, "GET"),
    staleTime: 30_000,
  });

  const title = query.data?.collection?.name || slug;
  const description = query.data?.collection?.description || labels.defaultDescription;
  const items = (query.data?.items || []) as StoreProduct[];
  const isBdo = tenant.key === "bdo";

  return (
    <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          {isBdo ? <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#E8C873]">{labels.brand}</p> : null}
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-white/60">{description}</p>
          {isBdo ? <p className="mt-1 text-xs text-[#F5F3EC]/70">{labels.caption}</p> : null}
        </header>

        {query.isLoading ? (
          <div className="rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">{labels.loading}</div>
        ) : (
          <ProductGrid items={items} />
        )}
      </div>
    </main>
  );
}
