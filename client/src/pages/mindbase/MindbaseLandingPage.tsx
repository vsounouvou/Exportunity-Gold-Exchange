import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  usage_count: number;
  creator: {
    display_name: string;
    share_slug: string | null;
  };
};

export default function MindbaseLandingPage() {
  const { data, isLoading } = useQuery<{ ok: boolean; items: DiscoverItem[] }>({
    queryKey: ["/api/mindbase/discover?limit=6"],
    staleTime: 30_000,
  });

  const items = Array.isArray(data?.items) ? data.items : [];

  return (
    <MindbaseLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <section className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm md:p-8">
          <span className="mb-4 inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--chipActiveBg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--chipActiveText)]">
            MindBase
          </span>
          <h1
            className="max-w-4xl text-3xl font-semibold text-[var(--text)] md:text-5xl"
            style={{ fontFamily: "Poppins, Roboto, sans-serif" }}
          >
            Own your intelligence. Deploy your Mind.
          </h1>
          <p className="mt-4 max-w-3xl text-[var(--muted)]">
            Build a personal MindBase, train your Agent with your documents, then publish and get hired by people or companies.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={mindbasePath("/build/chat")}>
              <a className="inline-flex items-center justify-center rounded-[10px] bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--primaryHover)]">
                Build My MindBase
              </a>
            </Link>
            <Link href={mindbasePath("/discover")}>
              <a className="inline-flex items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--chipBg)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] hover:bg-slate-200">
                Hire an Agent
              </a>
            </Link>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["1", "Create your profile", "Set your identity, expertise, and public profile."],
            ["2", "Build your Agent", "Define role, tone, and rules for consistent behavior."],
            ["3", "Upload knowledge", "Index docs with RAG and chat with citations by filename."],
          ].map(([step, title, copy]) => (
            <Card key={step} className="border-[var(--border)] bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  <span className="mr-2 text-[var(--primary)]">{step}.</span>
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[var(--muted)]">{copy}</CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[var(--text)]" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
              Featured Agents
            </h2>
            <Link href={mindbasePath("/discover")}>
              <a className="text-sm text-[var(--primary)] hover:underline">Explore all</a>
            </Link>
          </div>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, idx) => (
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
                        {item.tagline || "General-purpose digital expert for practical outcomes."}
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
                      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:items-center">
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
                    </CardContent>
                  </Card>
                );
              })}
              {!items.length ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                  No published Agents yet.
                </div>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </MindbaseLayout>
  );
}
