import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const CANONICAL = "https://vitalsounouvou.com";

type Block = {
  id: number;
  page_path: string;
  block_key: string;
  title: string | null;
  content: string | null;
  sort_order: number;
};

type Insight = {
  id: number;
  title: string;
  brief: string | null;
  kind: string;
  published_at: string | null;
  created_at: string;
};

function useSeo(title: string, description: string, path: string) {
  useEffect(() => {
    document.title = title;
    const meta = (document.querySelector('meta[name="description"]') || document.createElement("meta")) as HTMLMetaElement;
    meta.setAttribute("name", "description");
    meta.setAttribute("content", description);
    if (!meta.parentNode) document.head.appendChild(meta);
    const canonical = (document.querySelector('link[rel="canonical"]') || document.createElement("link")) as HTMLLinkElement;
    canonical.setAttribute("rel", "canonical");
    canonical.setAttribute("href", `${CANONICAL}${path}`);
    if (!canonical.parentNode) document.head.appendChild(canonical);
  }, [description, path, title]);
}

function useBlocks(page: string) {
  return useQuery<{ blocks: Block[] }>({
    queryKey: ["vs", "blocks", page],
    queryFn: () => apiRequest(`/api/vs/public/website?page=${encodeURIComponent(page)}`, "GET"),
    staleTime: 60_000,
  });
}

function useInsights(limit = 24) {
  return useQuery<{ items: Insight[] }>({
    queryKey: ["vs", "insights", limit],
    queryFn: () => apiRequest(`/api/vs/public/insights?limit=${limit}`, "GET"),
    staleTime: 60_000,
  });
}

function VsLayout({
  title,
  description,
  path,
  children,
}: {
  title: string;
  description: string;
  path: string;
  children: React.ReactNode;
}) {
  useSeo(title, description, path);
  const links = [
    ["/", "Home"],
    ["/about", "About"],
    ["/press", "Press"],
    ["/portfolio", "Portfolio"],
    ["/insights", "Insights"],
    ["/contact", "Contact"],
  ] as const;

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-[#152018]">
      <header className="border-b border-[#d7c7a3] bg-gradient-to-r from-[#f8f4ea] to-[#efe6d2]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <a href="/" className="text-lg font-bold tracking-wide text-[#2f3d30]">
            Vital Sounouvou
          </a>
          <nav className="ml-auto flex flex-wrap gap-2 text-sm">
            {links.map(([href, label]) => (
              <a key={href} href={href} className="rounded-md px-3 py-1.5 text-[#2f3d30] hover:bg-[#d9cca9]/40">
                {label}
              </a>
            ))}
            <a href="/admin/vs" className="rounded-md bg-[#2f3d30] px-3 py-1.5 font-semibold text-white">
              Admin
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-10">{children}</main>
    </div>
  );
}

function BlocksList({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <section key={block.id} className="rounded-xl border border-[#d7c7a3] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#2f3d30]">{block.title || block.block_key}</h2>
          <p className="mt-2 text-sm leading-7 text-[#334236]">{block.content || "No content yet."}</p>
        </section>
      ))}
      {!blocks.length ? (
        <section className="rounded-xl border border-[#d7c7a3] bg-white p-5 text-sm text-[#334236]">No published blocks yet.</section>
      ) : null}
    </div>
  );
}

export function VsHomePage() {
  const blocksQuery = useBlocks("/");
  const insightsQuery = useInsights(6);
  const insights = insightsQuery.data?.items || [];
  return (
    <VsLayout
      title="Vital Sounouvou - Strategic Narrative and Reputation Infrastructure"
      description="Official platform of Vital Sounouvou for reputation governance, media outreach, and social intelligence."
      path="/"
    >
      <section className="rounded-2xl border border-[#d7c7a3] bg-gradient-to-r from-[#2f3d30] to-[#55673f] p-8 text-white">
        <p className="text-xs uppercase tracking-[0.22em] text-[#d9cca9]">Reputation and PR Operating System</p>
        <h1 className="mt-2 text-4xl font-bold">Vital Sounouvou</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#f3ead7]">
          Intelligence is governed in layers. Strategy stays at the top. Execution runs through deterministic workflows.
        </p>
      </section>
      <div className="mt-6">
        <BlocksList blocks={blocksQuery.data?.blocks || []} />
      </div>
      <section className="mt-6 rounded-xl border border-[#d7c7a3] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#2f3d30]">Latest Insights</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {insights.map((item) => (
            <a key={item.id} href="/insights" className="rounded-lg border border-[#e7dcc0] p-3 hover:bg-[#f8f4ea]">
              <p className="text-sm font-semibold text-[#2f3d30]">{item.title}</p>
              <p className="mt-1 text-xs text-[#516154]">{item.brief || "Published content item"}</p>
            </a>
          ))}
        </div>
      </section>
    </VsLayout>
  );
}

export function VsAboutPage() {
  const blocksQuery = useBlocks("/about");
  return (
    <VsLayout title="About - Vital Sounouvou" description="Biography, doctrine, and speaking topics." path="/about">
      <BlocksList blocks={blocksQuery.data?.blocks || []} />
    </VsLayout>
  );
}

export function VsPressPage() {
  const blocksQuery = useBlocks("/press");
  return (
    <VsLayout title="Press - Vital Sounouvou" description="Press kit, approved mentions, and media contact." path="/press">
      <BlocksList blocks={blocksQuery.data?.blocks || []} />
    </VsLayout>
  );
}

export function VsPortfolioPage() {
  const blocksQuery = useBlocks("/portfolio");
  return (
    <VsLayout title="Portfolio - Vital Sounouvou" description="Curated systems, deployments, and strategic implementations." path="/portfolio">
      <BlocksList blocks={blocksQuery.data?.blocks || []} />
    </VsLayout>
  );
}

export function VsInsightsPage() {
  const insightsQuery = useInsights(100);
  const items = insightsQuery.data?.items || [];
  const ordered = useMemo(
    () =>
      [...items].sort((a, b) => {
        const ad = new Date(a.published_at || a.created_at).getTime();
        const bd = new Date(b.published_at || b.created_at).getTime();
        return bd - ad;
      }),
    [items],
  );
  return (
    <VsLayout title="Insights - Vital Sounouvou" description="Published strategic insights and operational briefs." path="/insights">
      <section className="space-y-3">
        {ordered.map((item) => (
          <article key={item.id} className="rounded-xl border border-[#d7c7a3] bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-[#7b8f63]">{item.kind}</p>
            <h2 className="mt-1 text-lg font-semibold text-[#2f3d30]">{item.title}</h2>
            <p className="mt-2 text-sm text-[#4e5f50]">{item.brief || "No summary provided."}</p>
          </article>
        ))}
        {!ordered.length ? <p className="text-sm text-[#4e5f50]">No published insights yet.</p> : null}
      </section>
    </VsLayout>
  );
}

export function VsContactPage() {
  const blocksQuery = useBlocks("/contact");
  const [form, setForm] = useState({ fullName: "", email: "", type: "Media request", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      await apiRequest("/api/vs/public/contact", "POST", form);
      setStatus("done");
      setForm({ fullName: "", email: "", type: "Media request", message: "" });
    } catch (err: any) {
      setStatus("error");
      setError(String(err?.message || "Failed to send message"));
    }
  }

  return (
    <VsLayout title="Contact - Vital Sounouvou" description="Media, partnership, speaking, and strategic requests." path="/contact">
      <BlocksList blocks={blocksQuery.data?.blocks || []} />
      <form onSubmit={submit} className="mt-6 rounded-xl border border-[#d7c7a3] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#2f3d30]">Send a Request</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            required
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            placeholder="Full name"
            className="rounded-md border border-[#d7c7a3] px-3 py-2 text-sm"
          />
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="Email"
            className="rounded-md border border-[#d7c7a3] px-3 py-2 text-sm"
          />
          <select
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
            className="rounded-md border border-[#d7c7a3] px-3 py-2 text-sm"
          >
            <option>Media request</option>
            <option>Partnership</option>
            <option>Speaking</option>
            <option>Other</option>
          </select>
        </div>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
          placeholder="Your message"
          className="mt-3 w-full rounded-md border border-[#d7c7a3] px-3 py-2 text-sm"
        />
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        {status === "done" ? <p className="mt-2 text-xs text-emerald-700">Message sent successfully.</p> : null}
        <button disabled={status === "loading"} className="mt-3 rounded-md bg-[#2f3d30] px-4 py-2 text-sm font-semibold text-white">
          {status === "loading" ? "Sending..." : "Submit"}
        </button>
      </form>
    </VsLayout>
  );
}

