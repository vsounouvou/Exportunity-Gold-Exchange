import { useQuery } from "@tanstack/react-query";

import { CollectionCard } from "@/components/storefront/CollectionCard";
import { useLocale } from "@/contexts/LocaleContext";
import { apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant";
import type { StoreCollection } from "@/types/storefront";

const copy = {
  fr: {
    title: "Collections d'or certifie",
    subtitle: "Selections de pieces, lingots et bijoux verifies par Bourse de l'Or.",
    loading: "Chargement des collections...",
    brand: "BOURSE DE L'OR",
  },
  en: {
    title: "Certified gold collections",
    subtitle: "Selections of verified pieces, bullion and jewelry from Bourse de l'Or.",
    loading: "Loading collections...",
    brand: "BOURSE DE L'OR",
  },
  ar: {
    title: "مجموعات الذهب المعتمد",
    subtitle: "اختيارات من القطع والسبائك والمجوهرات الموثقة عبر بورصة الذهب.",
    loading: "جاري تحميل المجموعات...",
    brand: "BOURSE DE L'OR",
  },
};

async function fetchCollections() {
  const payload = await apiRequest("/api/store/collections", "GET");
  return (payload?.items || []) as StoreCollection[];
}

export default function StoreCollectionsPage() {
  const { language } = useLocale();
  const { tenant } = useTenant();
  const labels = copy[language] || copy.fr;
  const isBdo = tenant.key === "bdo";
  const collectionsQuery = useQuery({
    queryKey: ["store", "collections"],
    queryFn: fetchCollections,
    staleTime: 60_000,
  });

  return (
    <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          {isBdo ? <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#E8C873]">{labels.brand}</p> : null}
          <h1 className="text-2xl font-semibold">{labels.title}</h1>
          <p className="text-sm text-white/60">{labels.subtitle}</p>
        </header>

        {collectionsQuery.isLoading ? (
          <div className="rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">{labels.loading}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(collectionsQuery.data || []).map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
