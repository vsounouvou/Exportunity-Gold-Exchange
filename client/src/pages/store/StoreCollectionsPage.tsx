import { useQuery } from "@tanstack/react-query";

import { CollectionCard } from "@/components/storefront/CollectionCard";
import { apiRequest } from "@/lib/queryClient";
import type { StoreCollection } from "@/types/storefront";

async function fetchCollections() {
  const payload = await apiRequest("/api/store/collections", "GET");
  return (payload?.items || []) as StoreCollection[];
}

export default function StoreCollectionsPage() {
  const collectionsQuery = useQuery({
    queryKey: ["store", "collections"],
    queryFn: fetchCollections,
    staleTime: 60_000,
  });

  return (
    <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">Collections</h1>
          <p className="text-sm text-white/60">Shared collection layout across all tenants.</p>
        </header>

        {collectionsQuery.isLoading ? (
          <div className="rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">Loading collections...</div>
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
