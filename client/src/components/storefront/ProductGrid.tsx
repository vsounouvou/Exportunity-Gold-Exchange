import type { StoreProduct } from "@/types/storefront";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ items }: { items: StoreProduct[] }) {
  if (!items.length) {
    return <div className="rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">No products found.</div>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <ProductCard key={item.id} product={item} />
      ))}
    </div>
  );
}
