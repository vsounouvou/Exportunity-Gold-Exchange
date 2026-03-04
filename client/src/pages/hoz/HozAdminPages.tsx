import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

function NavTabs() {
  const links = [
    ["/admin/hoz", "Dashboard"],
    ["/admin/hoz/collections", "Collections"],
    ["/admin/hoz/media", "Media"],
    ["/admin/hoz/inbox", "Inbox"],
    ["/admin/hoz/website", "Website"],
    ["/admin/hoz/settings", "Settings"],
  ] as const;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {links.map(([href, label]) => (
        <a key={href} href={href} className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/90 hover:bg-white/10">
          {label}
        </a>
      ))}
    </div>
  );
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4 p-4 text-white">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <NavTabs />
      {children}
    </div>
  );
}

function JsonCard({ title, items }: { title: string; items: any }) {
  return (
    <section className="rounded-lg border border-white/15 bg-white/5 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <pre className="mt-2 max-h-[520px] overflow-auto rounded bg-black/30 p-3 text-xs">{JSON.stringify(items, null, 2)}</pre>
    </section>
  );
}

function useEndpoint<T = any>(path: string, enabled = true) {
  return useQuery<T>({
    queryKey: ["hoz", path],
    enabled,
    queryFn: () => apiRequest(path, "GET"),
    staleTime: 15_000,
  });
}

export function HozAdminDashboardPage() {
  const dashboard = useEndpoint<{ metrics: Record<string, number> }>("/api/admin/hoz/dashboard");
  const metrics = dashboard.data?.metrics || {};
  return (
    <Shell title="House of Zogue Admin">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-white/15 bg-white/5 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/70">{key}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-white/15 bg-white/5 p-4 text-sm text-white/80">
        Tenant-specific modules are enabled for collections, media, inbox, and website blocks while preserving the standard admin shell.
      </div>
    </Shell>
  );
}

export function HozAdminCollectionsPage() {
  const queryClient = useQueryClient();
  const books = useEndpoint<{ items: any[] }>("/api/admin/hoz/content/library?kind=books");
  const jewelry = useEndpoint<{ items: any[] }>("/api/admin/hoz/content/library?kind=jewelry");

  const [form, setForm] = useState({
    title: "",
    category: "books",
    description: "",
    externalUrl: "",
    tags: "",
  });
  const mutation = useMutation({
    mutationFn: async () => apiRequest("/api/admin/hoz/content/library", "POST", form),
    onSuccess: () => {
      setForm({ title: "", category: "books", description: "", externalUrl: "", tags: "" });
      queryClient.invalidateQueries({ queryKey: ["hoz", "/api/admin/hoz/content/library?kind=books"] });
      queryClient.invalidateQueries({ queryKey: ["hoz", "/api/admin/hoz/content/library?kind=jewelry"] });
      queryClient.invalidateQueries({ queryKey: ["hoz", "/api/admin/hoz/dashboard"] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Shell title="Collections">
      <form onSubmit={submit} className="rounded-lg border border-white/15 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Add collection item</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-5">
          <input
            required
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="title"
          />
          <select
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
          >
            <option value="books">books</option>
            <option value="jewelry">jewelry</option>
          </select>
          <input
            value={form.externalUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, externalUrl: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="external url"
          />
          <input
            value={form.tags}
            onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="tags (comma)"
          />
          <button disabled={mutation.isPending} className="rounded bg-amber-400 px-3 py-2 text-sm font-semibold text-black">
            {mutation.isPending ? "Saving..." : "Create"}
          </button>
        </div>
        <textarea
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          className="mt-2 w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
          placeholder="description"
          rows={3}
        />
      </form>
      <JsonCard title="Books" items={books.data?.items || []} />
      <JsonCard title="Jewelry" items={jewelry.data?.items || []} />
    </Shell>
  );
}

export function HozAdminMediaPage() {
  const posts = useEndpoint<{ items: any[] }>("/api/admin/hoz/content/posts");
  const press = useEndpoint<{ items: any[] }>("/api/admin/hoz/content/press");
  return (
    <Shell title="Media">
      <JsonCard title="Posts" items={posts.data?.items || []} />
      <JsonCard title="Press" items={press.data?.items || []} />
    </Shell>
  );
}

export function HozAdminInboxPage() {
  const queryClient = useQueryClient();
  const inbox = useEndpoint<{ items: any[] }>("/api/admin/hoz/inbox");
  const [activeId, setActiveId] = useState<number | null>(null);

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "pending" | "sent" | "failed" | "skipped" }) =>
      apiRequest(`/api/admin/hoz/inbox/${id}`, "PATCH", { notifyStatus: status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hoz", "/api/admin/hoz/inbox"] });
    },
  });

  const activeItem = useMemo(() => {
    const items = inbox.data?.items || [];
    return items.find((item) => Number(item.id) === Number(activeId)) || null;
  }, [activeId, inbox.data?.items]);

  return (
    <Shell title="Inbox">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-lg border border-white/15 bg-white/5 p-4">
          <h2 className="text-sm font-semibold">Messages</h2>
          <div className="mt-3 space-y-2">
            {(inbox.data?.items || []).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveId(Number(item.id))}
                className={`w-full rounded border px-3 py-2 text-left text-sm ${
                  Number(item.id) === Number(activeId) ? "border-amber-400 bg-white/10" : "border-white/20 bg-black/10"
                }`}
              >
                <p className="font-medium">{item.firstName} {item.lastName}</p>
                <p className="text-xs text-white/70">{item.email}</p>
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-white/15 bg-white/5 p-4">
          <h2 className="text-sm font-semibold">Message Detail</h2>
          {activeItem ? (
            <div className="mt-3 space-y-3">
              <pre className="max-h-[320px] overflow-auto rounded bg-black/30 p-3 text-xs">{JSON.stringify(activeItem, null, 2)}</pre>
              <div className="flex flex-wrap gap-2">
                {(["pending", "sent", "failed", "skipped"] as const).map((status) => (
                  <button
                    key={status}
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate({ id: Number(activeItem.id), status })}
                    className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10"
                  >
                    Mark {status}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/70">Select a message from the list.</p>
          )}
        </section>
      </div>
    </Shell>
  );
}

export function HozAdminWebsitePage() {
  const queryClient = useQueryClient();
  const site = useEndpoint<{ content: Record<string, Record<string, unknown>> }>("/api/admin/hoz/content/site");
  const [selectedKey, setSelectedKey] = useState("home.hero");
  const [draftValue, setDraftValue] = useState("{}");

  const selectedValue = useMemo(() => {
    const source = site.data?.content || {};
    return source[selectedKey] || {};
  }, [selectedKey, site.data?.content]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(draftValue);
      return apiRequest(`/api/admin/hoz/content/site/${encodeURIComponent(selectedKey)}`, "PUT", { value: parsed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hoz", "/api/admin/hoz/content/site"] });
      queryClient.invalidateQueries({ queryKey: ["hoz", "/api/admin/hoz/dashboard"] });
    },
  });

  return (
    <Shell title="Website">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-lg border border-white/15 bg-white/5 p-4">
          <h2 className="text-sm font-semibold">Blocks</h2>
          <div className="mt-3 space-y-2">
            {Object.keys(site.data?.content || {}).map((key) => (
              <button
                key={key}
                onClick={() => {
                  setSelectedKey(key);
                  setDraftValue(JSON.stringify((site.data?.content || {})[key] || {}, null, 2));
                }}
                className={`w-full rounded border px-3 py-2 text-left text-sm ${
                  key === selectedKey ? "border-amber-400 bg-white/10" : "border-white/20 bg-black/10"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-white/15 bg-white/5 p-4">
          <h2 className="text-sm font-semibold">Edit {selectedKey}</h2>
          <pre className="mt-2 rounded bg-black/30 p-3 text-xs">{JSON.stringify(selectedValue, null, 2)}</pre>
          <textarea
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            className="mt-2 min-h-[220px] w-full rounded border border-white/20 bg-black/20 px-3 py-2 font-mono text-xs"
          />
          <button
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="mt-2 rounded bg-amber-400 px-3 py-2 text-sm font-semibold text-black"
          >
            {saveMutation.isPending ? "Saving..." : "Save block"}
          </button>
        </section>
      </div>
    </Shell>
  );
}

export function HozAdminSettingsPage() {
  const settings = useEndpoint<any>("/api/admin/hoz/settings");
  return (
    <Shell title="Settings">
      <JsonCard title="Tenant Settings" items={settings.data || {}} />
    </Shell>
  );
}
