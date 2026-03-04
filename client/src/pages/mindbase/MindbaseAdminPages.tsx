import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

function Shell({ title, children }: { title: string; children: ReactNode }) {
  const links = [
    ["/admin/mindbase", "Dashboard"],
    ["/admin/mindbase/moderation", "Moderation"],
    ["/admin/mindbase/users", "Users"],
    ["/admin/mindbase/credits", "Credits"],
    ["/admin/mindbase/agents", "Agents"],
    ["/admin/mindbase/settings", "Settings"],
  ] as const;

  return (
    <div className="space-y-4 p-4 text-white">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {links.map(([href, label]) => (
          <a key={href} href={href} className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/90 hover:bg-white/10">
            {label}
          </a>
        ))}
      </div>
      {children}
    </div>
  );
}

function JsonCard({ title, payload }: { title: string; payload: any }) {
  return (
    <section className="rounded-lg border border-white/15 bg-white/5 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <pre className="mt-2 max-h-[520px] overflow-auto rounded bg-black/30 p-3 text-xs">{JSON.stringify(payload, null, 2)}</pre>
    </section>
  );
}

function useApi<T = any>(path: string) {
  return useQuery<T>({
    queryKey: ["mindbase-admin", path],
    queryFn: () => apiRequest(path, "GET"),
    staleTime: 15_000,
  });
}

export function MindbaseAdminDashboardPage() {
  const dashboard = useApi<{ metrics: Record<string, number> }>("/api/admin/mindbase/dashboard");
  const metrics = dashboard.data?.metrics || {};

  return (
    <Shell title="MindBase Admin">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-white/15 bg-white/5 p-3">
            <p className="text-[11px] uppercase tracking-wide text-white/70">{key}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function MindbaseAdminModerationPage() {
  const queryClient = useQueryClient();
  const intellects = useApi<{ items: any[] }>("/api/admin/mindbase/intellects");

  const moderateMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" | "unpublish" }) =>
      apiRequest(`/api/admin/mindbase/intellects/${id}/moderate`, "POST", { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mindbase-admin", "/api/admin/mindbase/intellects"] });
      queryClient.invalidateQueries({ queryKey: ["mindbase-admin", "/api/admin/mindbase/dashboard"] });
    },
  });

  return (
    <Shell title="Moderation">
      <section className="rounded-lg border border-white/15 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Intellect moderation queue</h2>
        <div className="mt-3 space-y-2">
          {(intellects.data?.items || []).map((item) => (
            <div key={item.id} className="rounded border border-white/15 bg-black/20 p-3">
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-white/70">{item.slug} | {item.publishStatus || "draft"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                  onClick={() => moderateMutation.mutate({ id: item.id, action: "approve" })}
                  disabled={moderateMutation.isPending}
                >
                  Approve
                </button>
                <button
                  className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                  onClick={() => moderateMutation.mutate({ id: item.id, action: "reject" })}
                  disabled={moderateMutation.isPending}
                >
                  Reject
                </button>
                <button
                  className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
                  onClick={() => moderateMutation.mutate({ id: item.id, action: "unpublish" })}
                  disabled={moderateMutation.isPending}
                >
                  Unpublish
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

export function MindbaseAdminUsersPage() {
  const users = useApi<{ items: any[] }>("/api/admin/mindbase/users");
  const workspaces = useApi<{ items: any[] }>("/api/admin/mindbase/workspaces");
  return (
    <Shell title="Users and Workspaces">
      <JsonCard title="Users" payload={users.data?.items || []} />
      <JsonCard title="Workspaces" payload={workspaces.data?.items || []} />
    </Shell>
  );
}

export function MindbaseAdminCreditsPage() {
  const queryClient = useQueryClient();
  const ledger = useApi<{ items: any[] }>("/api/admin/mindbase/credits/ledger");
  const [form, setForm] = useState({ userId: "", amount: "", reason: "" });

  const topupMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/mindbase/credits/topup", "POST", {
        userId: Number(form.userId || 0),
        amount: Number(form.amount || 0),
        reason: form.reason,
      }),
    onSuccess: () => {
      setForm({ userId: "", amount: "", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["mindbase-admin", "/api/admin/mindbase/credits/ledger"] });
      queryClient.invalidateQueries({ queryKey: ["mindbase-admin", "/api/admin/mindbase/dashboard"] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    topupMutation.mutate();
  }

  return (
    <Shell title="Credits">
      <form onSubmit={submit} className="rounded-lg border border-white/15 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Admin top-up</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input
            required
            value={form.userId}
            onChange={(event) => setForm((prev) => ({ ...prev, userId: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="user id"
          />
          <input
            required
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="amount"
          />
          <input
            value={form.reason}
            onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="reason"
          />
          <button disabled={topupMutation.isPending} className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-black">
            {topupMutation.isPending ? "Applying..." : "Apply top-up"}
          </button>
        </div>
      </form>
      <JsonCard title="Credits ledger" payload={ledger.data?.items || []} />
    </Shell>
  );
}

export function MindbaseAdminAgentsPage() {
  const queryClient = useQueryClient();
  const agents = useApi<{ items: any[] }>("/api/admin/mindbase/agents");
  const [form, setForm] = useState({
    agentId: "",
    ownerUserId: "",
    name: "",
    category: "general",
  });

  const promoteMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/mindbase/promote-agent", "POST", {
        agentId: Number(form.agentId || 0),
        ownerUserId: Number(form.ownerUserId || 0),
        name: form.name || undefined,
        category: form.category || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mindbase-admin", "/api/admin/mindbase/intellects"] });
      queryClient.invalidateQueries({ queryKey: ["mindbase-admin", "/api/admin/mindbase/agents"] });
      setForm({ agentId: "", ownerUserId: "", name: "", category: "general" });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    promoteMutation.mutate();
  }

  return (
    <Shell title="Agents">
      <form onSubmit={submit} className="rounded-lg border border-white/15 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Promote base agent to intellect</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-5">
          <input
            required
            value={form.agentId}
            onChange={(event) => setForm((prev) => ({ ...prev, agentId: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="agent id"
          />
          <input
            required
            value={form.ownerUserId}
            onChange={(event) => setForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="owner user id"
          />
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="intellect name"
          />
          <input
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm"
            placeholder="category"
          />
          <button disabled={promoteMutation.isPending} className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-black">
            {promoteMutation.isPending ? "Promoting..." : "Promote"}
          </button>
        </div>
      </form>
      <JsonCard title="Tenant base agents" payload={agents.data?.items || []} />
    </Shell>
  );
}

export function MindbaseAdminSettingsPage() {
  const dashboard = useApi<any>("/api/admin/mindbase/dashboard");
  const users = useApi<any>("/api/admin/mindbase/users");
  return (
    <Shell title="Settings">
      <JsonCard title="Dashboard snapshot" payload={dashboard.data || {}} />
      <JsonCard title="Users snapshot" payload={users.data || {}} />
    </Shell>
  );
}
