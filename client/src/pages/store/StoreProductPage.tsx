import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

import { apiRequest } from "@/lib/queryClient";
import type { StoreProduct } from "@/types/storefront";

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export default function StoreProductPage({ slug }: { slug: string }) {
  const query = useQuery({
    queryKey: ["store", "product", slug],
    queryFn: async () => apiRequest(`/api/store/product/${encodeURIComponent(slug)}`, "GET"),
    staleTime: 20_000,
  });

  const product = (query.data?.item || null) as StoreProduct | null;

  if (query.isLoading) {
    return (
      <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">
          Loading product...
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl rounded-xl border border-white/10 bg-[#0b1220] p-6 text-sm text-white/60">
          Product not found. <Link href="/store"><span className="text-amber-300">Back to store</span></Link>
        </div>
      </main>
    );
  }

  const cover = product.media?.[0] || "";

  return (
    <main className="min-h-screen bg-[#020817] px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/store">
          <span className="text-xs text-white/60 hover:text-white">Back to Store</span>
        </Link>

        <section className="grid gap-6 rounded-2xl border border-white/10 bg-[#0b1220] p-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-xl bg-[#111827] p-2">
            {cover ? (
              <img src={cover} alt={product.title} className="h-full w-full rounded-lg object-cover" />
            ) : (
              <div className="flex min-h-[280px] items-center justify-center text-sm text-white/50">No image available</div>
            )}
          </div>

          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">{product.title}</h1>
            <p className="text-sm text-white/70">{product.subtitle || product.description}</p>
            <div className="text-lg font-semibold text-amber-300">{formatMoney(product.price, product.currency)}</div>
            <div className="flex flex-wrap gap-2">
              {(product.tags || []).map((tag) => (
                <span key={tag} className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0b1220] p-6">
          <h2 className="text-lg font-semibold">Description</h2>
          <p className="mt-2 text-sm text-white/70 whitespace-pre-wrap">{product.description || "No description available."}</p>
        </section>
      </div>
    </main>
  );
}
