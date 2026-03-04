import { Link } from "wouter";
import type { StoreCollection } from "@/types/storefront";

export function CollectionCard({ collection }: { collection: StoreCollection }) {
  return (
    <article className="rounded-xl border border-white/10 bg-[#0f172a] p-4">
      <h3 className="text-sm font-semibold text-white">{collection.name}</h3>
      <p className="mt-1 text-xs text-white/60 line-clamp-2">{collection.description || "Curated collection"}</p>
      <Link href={`/collections/${encodeURIComponent(collection.slug)}`}>
        <span className="mt-3 inline-block text-xs text-amber-300 hover:text-amber-200">Browse collection</span>
      </Link>
    </article>
  );
}
