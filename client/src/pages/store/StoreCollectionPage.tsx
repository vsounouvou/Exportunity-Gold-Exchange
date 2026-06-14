import { useQuery } from "@tanstack/react-query";

import { ProductGrid } from "@/components/storefront/ProductGrid";
import { useLocale } from "@/contexts/LocaleContext";
import { apiRequest } from "@/lib/queryClient";
import type { StoreProduct } from "@/types/storefront";

const copy = {
  fr: {
    defaultDescription: "Selection Bourse de l'Or documentee et verifiable.",
    loading: "Chargement de la collection...",
  },
  en: {
    defaultDescription: "Documented and verifiable Bourse de l'Or selection.",
    loading: "Loading collection...",
  },
  ar: {
    defaultDescription: "اختيار موثق وقابل للتحقق من بورصة الذهب.",
    loading: "جاري تحميل المجموعة...",
  },
};

export default function StoreCollectionPage({ slug }: { slug: string }) {
  const { language } = useLocale();
  const labels = copy[language] || copy.fr;
  const query = useQuery({
    queryKey: ["store", "collection", slug],
    queryFn: async () => apiRequest(`/api/store/collections/${encodeURIComponent(slug)}`, "GET"),
    staleTime: 30_000,
  });

  const title = query.data?.collection?.name || slug;
  const description = query.data?.collection?.description || labels.defaultDescription;
  const items = (query.data?.items || []) as StoreProduct[];

  return (
    <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-white/60">{description}</p>
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
