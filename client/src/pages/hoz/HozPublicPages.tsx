import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type PublicContentPayload = {
  content?: Record<string, Record<string, unknown>>;
};

type LibraryItem = {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  category?: string | null;
  externalUrl?: string | null;
  thumbnailLocal?: string | null;
  tags?: string[] | null;
};

type MediaPayload = {
  press?: Array<{ id: number; title: string; outlet?: string | null; externalUrl?: string | null; excerpt?: string | null }>;
  posts?: Array<{ id: number; title: string; slug: string; excerpt?: string | null; externalUrl?: string | null }>;
};

function t(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => t(entry)).filter(Boolean) : [];
}

function HozLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F4EE] text-[#1C2438]">
      <header className="border-b border-[#D5C4A1]/60 bg-[#F7F4EE]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-sm bg-[#1F2A44] text-xs font-semibold text-[#D5C4A1]">HZ</span>
            <span className="text-sm font-semibold tracking-wide">House of Zogue</span>
          </a>
          <nav className="flex items-center gap-5 text-sm">
            <a href="/books" className="hover:text-[#9A7D4F]">Books</a>
            <a href="/jewelry" className="hover:text-[#9A7D4F]">Jewelry</a>
            <a href="/media" className="hover:text-[#9A7D4F]">Media</a>
            <a href="/about" className="hover:text-[#9A7D4F]">About</a>
            <a href="/contact" className="hover:text-[#9A7D4F]">Contact</a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
      <footer className="border-t border-[#D5C4A1]/60 py-6 text-center text-xs text-[#6B6170]">
        Copyright {new Date().getFullYear()} House of Zogue
      </footer>
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#D5C4A1]/70 bg-white/80 p-6 shadow-[0_10px_35px_rgba(31,42,68,0.06)]">
      <h2 className="text-xl font-semibold">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-[#6B6170]">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function useSiteContent() {
  return useQuery<PublicContentPayload>({
    queryKey: ["hoz", "public", "content"],
    queryFn: () => apiRequest("/api/hoz/public/content", "GET"),
    staleTime: 30_000,
  });
}

function useCollections(kind: "books" | "jewelry") {
  return useQuery<{ items: LibraryItem[] }>({
    queryKey: ["hoz", "public", "collections", kind],
    queryFn: () => apiRequest(`/api/hoz/public/collections?kind=${kind}`, "GET"),
    staleTime: 30_000,
  });
}

function useMedia() {
  return useQuery<MediaPayload>({
    queryKey: ["hoz", "public", "media"],
    queryFn: () => apiRequest("/api/hoz/public/media", "GET"),
    staleTime: 30_000,
  });
}

export function HozHomePage() {
  const contentQuery = useSiteContent();
  const booksQuery = useCollections("books");
  const jewelryQuery = useCollections("jewelry");
  const content = contentQuery.data?.content || {};
  const hero = content["home.hero"] || {};
  const doctrine = content["home.doctrine"] || {};

  const featured = useMemo(() => {
    const books = booksQuery.data?.items || [];
    const jewelry = jewelryQuery.data?.items || [];
    return [...books.slice(0, 2), ...jewelry.slice(0, 2)];
  }, [booksQuery.data?.items, jewelryQuery.data?.items]);

  return (
    <HozLayout>
      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl bg-gradient-to-br from-[#1F2A44] via-[#26314F] to-[#0F172A] p-8 text-[#F7F4EE]">
          <p className="text-xs uppercase tracking-[0.2em] text-[#D5C4A1]">House of Zogue</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">{t(hero.title, "House of Zogue")}</h1>
          <p className="mt-3 max-w-xl text-sm text-[#E5DCCB]">{t(hero.subtitle, "Books, jewelry, and cultural media")}</p>
          <a
            href={t(hero.ctaHref, "/books")}
            className="mt-6 inline-flex items-center rounded-full bg-[#D5C4A1] px-5 py-2 text-sm font-semibold text-[#1F2A44] hover:bg-[#C4B18A]"
          >
            {t(hero.ctaLabel, "Explore Collections")}
          </a>
        </div>
        <SectionCard title={t(doctrine.heading, "Doctrine")}>
          <ul className="space-y-2 text-sm text-[#4B5568]">
            {arr(doctrine.points).map((point, index) => (
              <li key={`${point}-${index}`} className="rounded-lg border border-[#E9DFC9] bg-[#FBF9F3] px-3 py-2">
                {point}
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {featured.map((item) => (
          <a
            key={`${item.id}-${item.slug}`}
            href={item.externalUrl || "#"}
            className="rounded-2xl border border-[#D5C4A1]/70 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <p className="text-xs uppercase tracking-wider text-[#9A7D4F]">{t(item.category, "collection")}</p>
            <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm text-[#6B6170]">{t(item.description, "Curated by House of Zogue.")}</p>
          </a>
        ))}
      </section>
    </HozLayout>
  );
}

function CollectionPage({ kind, title, subtitle }: { kind: "books" | "jewelry"; title: string; subtitle: string }) {
  const query = useCollections(kind);
  const items = query.data?.items || [];
  return (
    <HozLayout>
      <SectionCard title={title} subtitle={subtitle}>
        <div className="grid gap-4 md:grid-cols-2">
          {items.length ? (
            items.map((item) => (
              <article key={item.id} className="rounded-xl border border-[#E9DFC9] bg-[#FBF9F3] p-4">
                <p className="text-xs uppercase tracking-wider text-[#9A7D4F]">{t(item.category, kind)}</p>
                <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-[#6B6170]">{t(item.description, "No description yet.")}</p>
                {item.externalUrl ? (
                  <a href={item.externalUrl} className="mt-3 inline-block text-sm font-semibold text-[#1F2A44] hover:text-[#9A7D4F]">
                    Open reference
                  </a>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-sm text-[#6B6170]">No curated entries yet.</p>
          )}
        </div>
      </SectionCard>
    </HozLayout>
  );
}

export function HozBooksPage() {
  return <CollectionPage kind="books" title="Books" subtitle="Editorial catalog and publication assets." />;
}

export function HozJewelryPage() {
  return <CollectionPage kind="jewelry" title="Jewelry" subtitle="Curated pieces and atelier stories." />;
}

export function HozMediaPage() {
  const mediaQuery = useMedia();
  const press = mediaQuery.data?.press || [];
  const posts = mediaQuery.data?.posts || [];

  return (
    <HozLayout>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Press">
          <div className="space-y-3">
            {press.length ? (
              press.map((item) => (
                <article key={item.id} className="rounded-xl border border-[#E9DFC9] bg-[#FBF9F3] p-4">
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="text-xs text-[#9A7D4F]">{t(item.outlet, "Media outlet")}</p>
                  <p className="mt-2 text-sm text-[#6B6170]">{t(item.excerpt, "No excerpt yet.")}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-[#6B6170]">No press items yet.</p>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Field Notes">
          <div className="space-y-3">
            {posts.length ? (
              posts.map((item) => (
                <article key={item.id} className="rounded-xl border border-[#E9DFC9] bg-[#FBF9F3] p-4">
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-[#6B6170]">{t(item.excerpt, "No summary yet.")}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-[#6B6170]">No published notes yet.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </HozLayout>
  );
}

export function HozAboutPage() {
  const contentQuery = useSiteContent();
  const doctrine = contentQuery.data?.content?.["home.doctrine"] || {};
  return (
    <HozLayout>
      <SectionCard title="About House of Zogue" subtitle="A luxury publishing and cultural narrative studio.">
        <p className="text-sm text-[#4B5568]">
          House of Zogue produces disciplined editorial and product narratives across books, jewelry, and media.
          Every release is curated for cultural continuity and modern execution quality.
        </p>
        <h3 className="mt-5 text-sm font-semibold uppercase tracking-wider text-[#9A7D4F]">Principles</h3>
        <ul className="mt-2 space-y-2 text-sm text-[#4B5568]">
          {arr(doctrine.points).map((point, index) => (
            <li key={`${point}-${index}`} className="rounded-lg border border-[#E9DFC9] bg-[#FBF9F3] px-3 py-2">
              {point}
            </li>
          ))}
        </ul>
      </SectionCard>
    </HozLayout>
  );
}

export function HozContactPage() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    company: "",
    phone: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => apiRequest("/api/hoz/public/contact", "POST", form),
    onSuccess: () => {
      setSubmitted(true);
      setForm({ fullName: "", email: "", company: "", phone: "", message: "" });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <HozLayout>
      <SectionCard title="Contact" subtitle="Media requests, partnerships, and private client inquiries.">
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded-lg border border-[#D5C4A1] bg-white px-3 py-2 text-sm"
            placeholder="Full name"
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            required
          />
          <input
            className="rounded-lg border border-[#D5C4A1] bg-white px-3 py-2 text-sm"
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            required
          />
          <input
            className="rounded-lg border border-[#D5C4A1] bg-white px-3 py-2 text-sm"
            placeholder="Company (optional)"
            value={form.company}
            onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
          />
          <input
            className="rounded-lg border border-[#D5C4A1] bg-white px-3 py-2 text-sm"
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <textarea
            className="md:col-span-2 min-h-[140px] rounded-lg border border-[#D5C4A1] bg-white px-3 py-2 text-sm"
            placeholder="Your message"
            value={form.message}
            onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
            required
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="md:col-span-2 w-full rounded-lg bg-[#1F2A44] px-4 py-2 text-sm font-semibold text-[#F7F4EE] hover:bg-[#26314F] disabled:opacity-70"
          >
            {mutation.isPending ? "Sending..." : "Send request"}
          </button>
          {mutation.isError ? <p className="md:col-span-2 text-sm text-red-700">Unable to send your request.</p> : null}
          {submitted ? <p className="md:col-span-2 text-sm text-[#1F2A44]">Message received. Our team will reply shortly.</p> : null}
        </form>
      </SectionCard>
    </HozLayout>
  );
}
