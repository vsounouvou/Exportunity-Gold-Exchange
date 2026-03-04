import type { StoreCollection } from "@/types/storefront";

type FiltersBarProps = {
  query: string;
  collectionSlug: string;
  collections: StoreCollection[];
  onQueryChange: (value: string) => void;
  onCollectionChange: (value: string) => void;
};

export function FiltersBar({ query, collectionSlug, collections, onQueryChange, onCollectionChange }: FiltersBarProps) {
  return (
    <div className="grid gap-3 rounded-xl border border-white/10 bg-[#0b1220] p-4 sm:grid-cols-3">
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search products"
        className="rounded-md border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
      <select
        value={collectionSlug}
        onChange={(event) => onCollectionChange(event.target.value)}
        className="rounded-md border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white"
      >
        <option value="">All collections</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.slug}>
            {collection.name}
          </option>
        ))}
      </select>
      <div className="text-xs text-white/60 flex items-center">Shared canonical product display</div>
    </div>
  );
}
