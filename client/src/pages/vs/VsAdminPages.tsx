import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

function useDashboard() {
  return useQuery<{ metrics: Record<string, number> }>({
    queryKey: ["vs", "admin", "dashboard"],
    queryFn: () => apiRequest("/api/admin/vs/dashboard", "GET"),
    staleTime: 15_000,
  });
}

function useTable(table: string, limit = 200) {
  return useQuery<{ items: any[] }>({
    queryKey: ["vs", "admin", "table", table, limit],
    queryFn: () => apiRequest(`/api/admin/vs/data/${encodeURIComponent(table)}?limit=${limit}`, "GET"),
    staleTime: 15_000,
  });
}

function NavTabs() {
  const links = [
    ["/admin/vs", "Dashboard"],
    ["/admin/vs/reputation", "Reputation"],
    ["/admin/vs/pr", "PR"],
    ["/admin/vs/studio", "Studio"],
    ["/admin/vs/social", "Social"],
    ["/admin/vs/inbox", "Inbox"],
    ["/admin/vs/agents", "Agents"],
    ["/admin/vs/assistant", "Assistant"],
    ["/admin/vs/actions", "Actions"],
    ["/admin/vs/users", "Users"],
    ["/admin/vs/settings", "Settings"],
    ["/admin/vs/website", "Website"],
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

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 p-4 text-white">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <NavTabs />
      {children}
    </div>
  );
}

function JsonCard({ title, items }: { title: string; items: any[] }) {
  return (
    <section className="rounded-lg border border-white/15 bg-white/5 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <pre className="mt-2 max-h-[420px] overflow-auto rounded bg-black/30 p-3 text-xs">{JSON.stringify(items, null, 2)}</pre>
    </section>
  );
}

export function VsAdminDashboardPage() {
  const query = useDashboard();
  const metrics = query.data?.metrics || {};
  return (
    <Shell title="Vital Sounouvou Admin">
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

export function VsAdminReputationPage() {
  const mentions = useTable("reputation_mentions");
  const alerts = useTable("reputation_alerts");
  const sources = useTable("reputation_sources");
  return (
    <Shell title="Reputation">
      <JsonCard title="Sources" items={sources.data?.items || []} />
      <JsonCard title="Mentions" items={mentions.data?.items || []} />
      <JsonCard title="Alerts" items={alerts.data?.items || []} />
    </Shell>
  );
}

export function VsAdminPrPage() {
  const campaigns = useTable("pr_campaigns");
  const outreach = useTable("outreach_messages");
  const contacts = useTable("media_contacts");
  return (
    <Shell title="PR">
      <JsonCard title="Campaigns" items={campaigns.data?.items || []} />
      <JsonCard title="Outreach Queue" items={outreach.data?.items || []} />
      <JsonCard title="Media Contacts" items={contacts.data?.items || []} />
    </Shell>
  );
}

export function VsAdminStudioPage() {
  const contentItems = useTable("content_items");
  const schedules = useTable("content_schedules");
  const jobs = useTable("publishing_jobs");
  return (
    <Shell title="Studio">
      <JsonCard title="Content Items" items={contentItems.data?.items || []} />
      <JsonCard title="Schedules" items={schedules.data?.items || []} />
      <JsonCard title="Publishing Jobs" items={jobs.data?.items || []} />
    </Shell>
  );
}

export function VsAdminSocialPage() {
  const accounts = useTable("social_accounts");
  const pages = useTable("social_pages");
  const health = useQuery<{ health: Record<string, number> }>({
    queryKey: ["vs", "social", "health"],
    queryFn: () => apiRequest("/api/admin/vs/social/health", "GET"),
    staleTime: 15_000,
  });

  const [connectForm, setConnectForm] = useState({ provider: "META", accountId: "", accountName: "", accessToken: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest("/api/admin/vs/social/connect", "POST", connectForm);
      window.location.reload();
    } catch (err: any) {
      setError(String(err?.message || "Failed to connect account"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell title="Social Connections">
      <section className="rounded-lg border border-white/15 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Connect Provider</h2>
        <form onSubmit={connect} className="mt-3 grid gap-2 md:grid-cols-2">
          <input value={connectForm.provider} onChange={(e) => setConnectForm((p) => ({ ...p, provider: e.target.value }))} className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm" placeholder="Provider (META, TIKTOK, YOUTUBE)" />
          <input required value={connectForm.accountId} onChange={(e) => setConnectForm((p) => ({ ...p, accountId: e.target.value }))} className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm" placeholder="Account ID" />
          <input value={connectForm.accountName} onChange={(e) => setConnectForm((p) => ({ ...p, accountName: e.target.value }))} className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm" placeholder="Account name" />
          <input value={connectForm.accessToken} onChange={(e) => setConnectForm((p) => ({ ...p, accessToken: e.target.value }))} className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm" placeholder="Access token" />
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
          <button disabled={saving} className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-black">{saving ? "Connecting..." : "Connect"}</button>
        </form>
      </section>
      <section className="rounded-lg border border-white/15 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Health</h2>
        <pre className="mt-2 rounded bg-black/30 p-3 text-xs">{JSON.stringify(health.data?.health || {}, null, 2)}</pre>
      </section>
      <JsonCard title="Accounts" items={accounts.data?.items || []} />
      <JsonCard title="Pages" items={pages.data?.items || []} />
    </Shell>
  );
}

export function VsAdminInboxPage() {
  const inbox = useTable("vs_inbox_messages");
  return (
    <Shell title="Inbox">
      <JsonCard title="Social / Contact Inbox" items={inbox.data?.items || []} />
    </Shell>
  );
}

export function VsAdminAgentsPage() {
  const agents = useQuery<{ items: any[] }>({
    queryKey: ["vs", "agents"],
    queryFn: () => apiRequest("/api/admin/vs/agents", "GET"),
    staleTime: 15_000,
  });
  return (
    <Shell title="Agents">
      <JsonCard title="Tenant Agents" items={agents.data?.items || []} />
    </Shell>
  );
}

export function VsAdminAssistantPage() {
  const assistant = useQuery<any>({
    queryKey: ["vs", "assistant"],
    queryFn: () => apiRequest("/api/admin/vs/assistant/context", "GET"),
    staleTime: 15_000,
  });
  return (
    <Shell title="Assistant (Taffy)">
      <pre className="rounded-lg border border-white/15 bg-black/30 p-4 text-xs">{JSON.stringify(assistant.data || {}, null, 2)}</pre>
      <a href="/ai-team" className="inline-block rounded-md bg-white/15 px-3 py-2 text-sm hover:bg-white/25">
        Open Assistant Workspace
      </a>
    </Shell>
  );
}

export function VsAdminActionsPage() {
  const data = useQuery<{ governed: any[]; queue: any[] }>({
    queryKey: ["vs", "actions"],
    queryFn: () => apiRequest("/api/admin/vs/actions", "GET"),
    staleTime: 10_000,
  });

  const [form, setForm] = useState({ agent: "ops", goal: "", budgetUsdCap: 0, budgetMaxCalls: 0, budgetMaxTokens: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function queueTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest("/api/admin/vs/actions/task", "POST", form);
      window.location.reload();
    } catch (err: any) {
      setError(String(err?.message || "Failed to queue task"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell title="Actions / Logs">
      <form onSubmit={queueTask} className="rounded-lg border border-white/15 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Queue Execution Task</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input value={form.agent} onChange={(e) => setForm((p) => ({ ...p, agent: e.target.value }))} className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm" placeholder="agent" />
          <input required value={form.goal} onChange={(e) => setForm((p) => ({ ...p, goal: e.target.value }))} className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm" placeholder="goal" />
          <input type="number" value={form.budgetUsdCap} onChange={(e) => setForm((p) => ({ ...p, budgetUsdCap: Number(e.target.value || 0) }))} className="rounded border border-white/20 bg-black/20 px-3 py-2 text-sm" placeholder="usd cap" />
          <button disabled={saving} className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-black">{saving ? "Queueing..." : "Queue"}</button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      </form>
      <JsonCard title="Governed Tasks" items={data.data?.governed || []} />
      <JsonCard title="Execution Queue (agent_tasks)" items={data.data?.queue || []} />
    </Shell>
  );
}

export function VsAdminUsersPage() {
  const users = useQuery<{ items: any[] }>({
    queryKey: ["vs", "users"],
    queryFn: () => apiRequest("/api/admin/vs/users", "GET"),
    staleTime: 15_000,
  });
  return (
    <Shell title="Users and Roles">
      <JsonCard title="Tenant Users" items={users.data?.items || []} />
    </Shell>
  );
}

export function VsAdminSettingsPage() {
  const settings = useQuery<any>({
    queryKey: ["vs", "settings"],
    queryFn: () => apiRequest("/api/admin/vs/settings", "GET"),
    staleTime: 15_000,
  });

  const identity = useMemo(() => {
    const rows = Array.isArray(settings.data?.settings) ? settings.data.settings : [];
    return rows.find((row: any) => row.key === "website.identity")?.value || {};
  }, [settings.data]);

  return (
    <Shell title="Settings">
      <pre className="rounded-lg border border-white/15 bg-black/30 p-4 text-xs">{JSON.stringify(settings.data || {}, null, 2)}</pre>
      <section className="rounded-lg border border-white/15 bg-white/5 p-4">
        <h2 className="text-sm font-semibold">Website Identity</h2>
        <p className="mt-2 text-sm text-white/80">{identity?.name || "Vital Sounouvou"}</p>
        <p className="text-xs text-white/70">{identity?.tagline || "Strategic narrative and reputation infrastructure"}</p>
      </section>
    </Shell>
  );
}

export function VsAdminWebsitePage() {
  const blocks = useTable("vs_website_blocks");
  return (
    <Shell title="Website">
      <JsonCard title="Editable Website Blocks" items={blocks.data?.items || []} />
    </Shell>
  );
}

