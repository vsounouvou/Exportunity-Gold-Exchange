import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import MindbaseLayout from "./MindbaseLayout";
import { mindbasePath } from "./routing";

type DiscoverItem = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  category: string;
  access_policy: "private" | "public" | "paid";
  price_per_100_messages: number;
  creator: {
    display_name: string;
    share_slug: string | null;
  };
};

export default function MindbaseDiscoverPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  const queryKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "120");
    if (q.trim()) params.set("q", q.trim());
    if (category.trim()) params.set("category", category.trim());
    return `/api/mindbase/discover?${params.toString()}`;
  }, [q, category]);

  const { data, isLoading } = useQuery<{ ok: boolean; items: DiscoverItem[] }>({
    queryKey: [queryKey],
    staleTime: 15_000,
  });

  const items = Array.isArray(data?.items) ? data.items : [];
  const categories = Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <MindbaseLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold text-[var(--text)]" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
          Explore Agents
        </h1>

        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Find by agent name, owner, or category"
            className="border-[var(--border)] bg-white text-[var(--text)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                !category
                  ? "border-[var(--border)] bg-[var(--chipActiveBg)] text-[var(--chipActiveText)]"
                  : "border-[var(--border)] bg-[var(--chipBg)] text-[var(--chipText)] hover:bg-slate-200"
              }`}
              onClick={() => setCategory("")}
            >
              All
            </button>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  category === item
                    ? "border-[var(--border)] bg-[var(--chipActiveBg)] text-[var(--chipActiveText)]"
                    : "border-[var(--border)] bg-[var(--chipBg)] text-[var(--chipText)] hover:bg-slate-200"
                }`}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div key={idx} className="h-44 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const pricing = item.access_policy === "paid" ? `${item.price_per_100_messages} credits / 100 msgs` : "Free";
              return (
                <Card
                  key={item.id}
                  className="rounded-[14px] border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                  style={{ boxShadow: "0 6px 20px rgba(15, 23, 42, 0.06)" }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg text-[var(--text)]">{item.name}</CardTitle>
                    <p className="line-clamp-2 text-sm text-[var(--muted)]">
                      {item.tagline || "Digital expert profile focused on useful outcomes."}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-[var(--muted)]">
                      Owner: <span className="font-medium">{item.creator.display_name}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--chipBg)] px-2.5 py-0.5 font-semibold text-[var(--chipText)]">
                        {item.category}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700">
                        {pricing}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-700">
                        Rating: N/A
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Link href={mindbasePath(`/i/${item.slug}`)}>
                          <a className="inline-flex min-w-[110px] items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--chipBg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-slate-200">
                            Preview
                          </a>
                        </Link>
                        <Link href={mindbasePath(`/i/${item.slug}`)}>
                          <a className="inline-flex min-w-[110px] items-center justify-center rounded-[10px] bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primaryHover)]">
                            Hire
                          </a>
                        </Link>
                      </div>
                      {item.creator.share_slug ? (
                        <Link href={mindbasePath(`/c/${item.creator.share_slug}`)}>
                          <a className="text-sm font-medium text-[var(--primary)] hover:underline">Owner</a>
                        </Link>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!items.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                No Agents match this search.
              </div>
            ) : null}
          </div>
        )}
      </main>
    </MindbaseLayout>
  );
}
