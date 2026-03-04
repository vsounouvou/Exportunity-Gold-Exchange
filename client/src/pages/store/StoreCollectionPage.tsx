import { useQuery } from "@tanstack/react-query";

import { ProductGrid } from "@/components/storefront/ProductGrid";
import { apiRequest } from "@/lib/queryClient";
import type { StoreProduct } from "@/types/storefront";

export default function StoreCollectionPage({ slug }: { slug: string }) {
  const query = useQuery({
    queryKey: ["store", "collection", slug],
    queryFn: async () => apiRequest(`/api/store/collections/${encodeURIComponent(slug)}`, "GET"),
    staleTime: 30_000,
  });

  const title = query.data?.collection?.name || slug;
  const description = query.data?.collection?.description || "Shared collection details";
  const items = (query.data?.items || []) as StoreProduct[];

  return (
    <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-white/60">{description}</p>
        </header>

        {query.isLoading ? (
          <div className="rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">Loading collection...</div>
        ) : (
          <ProductGrid items={items} />
        )}
      </div>
    </main>
  );
}
