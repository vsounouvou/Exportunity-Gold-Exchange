import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"] as const;
const LEAD_INTENTS = ["BUILD_HOUSE", "BUY_BRICKS", "VISIT_MODEL", "INFO"] as const;
const LEAD_SOURCES = ["WEB_FORM", "WHATSAPP", "ADMIN_MANUAL"] as const;
const ORDER_STATUSES = ["DRAFT", "SUBMITTED", "CONFIRMED", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
const ESTIMATE_STATUSES = ["NEW", "REVIEWING", "SENT", "CLOSED"] as const;
const PROJECT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  city: string;
  source: string;
  intent: string;
  status: string;
  internalNotes?: string | null;
  createdAt: string;
  orders?: Array<{ id: string; status: string }>;
  estimates?: Array<{ id: string; status: string }>;
};

type Order = {
  id: string;
  status: string;
  city?: string | null;
  deliveryAddress?: string | null;
  subtotalCfa?: number | null;
  deliveryFeeCfa?: number | null;
  totalCfa?: number | null;
  notes?: string | null;
  internalNotes?: string | null;
  createdAt: string;
  lead?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  items?: Array<{ id: string; productId: string; quantityPieces?: number | null; quantityPallets?: number | null; totalCfa?: number | null }>;
};

type Estimate = {
  id: string;
  status: string;
  projectCity: string;
  timeline?: string | null;
  brief?: string | null;
  planFileUrl?: string | null;
  internalNotes?: string | null;
  createdAt: string;
  lead?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  description?: string | null;
  dimensionsMm?: { length?: number; width?: number; height?: number } | null;
  compressiveStrengthMpa?: number | string | null;
  unit: "PIECE" | "PALLET";
  priceCfa: number;
  piecesPerPallet: number;
  isActive: boolean;
};

type Plan = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floors?: number | null;
  areaM2?: string | number | null;
  tags?: string[];
  thumbnailUrl?: string | null;
  fileUrl?: string | null;
  isActive: boolean;
};

type ProjectMedia = { assetUrl: string; caption?: string | null; sortOrder?: number | null };

type Project = {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  status: string;
  isFeatured: boolean;
  media?: ProjectMedia[];
};

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  contentMarkdown?: string | null;
  coverImageUrl?: string | null;
  publishedAt?: string | null;
};

type SettingRow = { id: string; key: string; value: Record<string, unknown>; updatedAt: string };

const t = (value: unknown) => String(value ?? "").trim();
const n = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const cfa = (value: unknown) => `${new Intl.NumberFormat("fr-FR").format(Math.max(0, Math.round(n(value))))} FCFA`;
const dt = (value: unknown) => {
  const raw = t(value);
  if (!raw) return "-";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString("fr-FR");
};

function buildPath(path: string | null | undefined, query?: Record<string, string>) {
  const base = t(path);
  if (!base) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (t(value)) params.set(key, t(value));
  }
  const suffix = params.toString();
  return suffix ? `${base}?${suffix}` : base;
}

function useApi<T>(path: string, enabled = true) {
  return useQuery<{ ok?: boolean; item?: T; items?: T[]; kpis?: Record<string, number> }>({
    queryKey: ["met-admin", path],
    enabled: Boolean(path) && enabled,
    staleTime: 15_000,
    queryFn: () => apiRequest(path, { method: "GET" }),
  });
}

function AdminShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} — Maison en Terre Admin`;
  }, [title]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-gray-300">{subtitle}</p> : null}
        <p className="mt-1 text-xs uppercase tracking-wide text-[#E8DCC2]">Maison en Terre Admin</p>
      </header>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-gray-700 bg-gray-900/80 p-4">{children}</div>;
}

function SaveButton({ onClick, label = "Enregistrer" }: { onClick: () => Promise<void> | void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onClick();
    } catch (err: any) {
      setError(String(err?.message || "Echec"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded bg-[#7A3E12] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#66340f] disabled:opacity-60"
      >
        {busy ? "Enregistrement..." : label}
      </button>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function MetAdminDashboardPage() {
  const kpisQuery = useApi<{ kpis: Record<string, number> }>("/api/admin/met/kpis");
  const kpis = kpisQuery.data?.kpis || {};

  return (
    <AdminShell title="Maison en Terre" subtitle="Vue d'ensemble du tenant met">
      <section className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-400">Nouveaux leads (7j)</p>
          <p className="mt-2 text-2xl font-semibold text-white">{kpisQuery.isLoading ? "..." : n(kpis.newLeadsLast7Days)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-400">Commandes soumises</p>
          <p className="mt-2 text-2xl font-semibold text-white">{kpisQuery.isLoading ? "..." : n(kpis.ordersSubmitted)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-400">Estimations en attente</p>
          <p className="mt-2 text-2xl font-semibold text-white">{kpisQuery.isLoading ? "..." : n(kpis.estimatesPending)}</p>
        </Card>
      </section>

      <Card>
        <div className="grid gap-2 text-xs sm:grid-cols-4 lg:grid-cols-5">
          {[
            ["/admin/met/leads", "Leads"],
            ["/admin/met/orders", "Commandes"],
            ["/admin/met/estimates", "Devis"],
            ["/admin/met/products", "Produits"],
            ["/admin/met/plans", "Plans"],
            ["/admin/met/projects", "Realisations"],
            ["/admin/met/blog", "Blog"],
            ["/admin/met/media", "Media"],
            ["/admin/met/settings", "Settings"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded border border-gray-600 px-2 py-1 text-center text-gray-200 hover:border-[#E8DCC2] hover:text-white">
              {label}
            </a>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}

export function MetAdminLeadsPage() {
  const [filters, setFilters] = useState({ status: "", intent: "", source: "", q: "" });
  const listPath = useMemo(
    () =>
      buildPath("/api/admin/met/leads", {
        limit: "120",
        status: filters.status,
        intent: filters.intent,
        source: filters.source,
        q: filters.q,
      }),
    [filters.intent, filters.q, filters.source, filters.status],
  );
  const listQuery = useApi<Lead>(listPath);
  const rows = listQuery.data?.items || [];

  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const detailPath = selectedId ? `/api/admin/met/leads/${selectedId}` : "";
  const detailQuery = useApi<Lead>(detailPath, Boolean(selectedId));
  const item = detailQuery.data?.item;

  const [status, setStatus] = useState("NEW");
  const [internalNotes, setInternalNotes] = useState("");
  useEffect(() => {
    setStatus(t(item?.status) || "NEW");
    setInternalNotes(t(item?.internalNotes));
  }, [item?.id, item?.internalNotes, item?.status]);

  async function save() {
    if (!item) return;
    await apiRequest(`/api/admin/met/leads/${item.id}`, "PATCH", {
      status,
      internalNotes: t(internalNotes) || null,
    });
    await Promise.all([listQuery.refetch(), detailQuery.refetch()]);
  }

  return (
    <AdminShell title="Leads" subtitle="Filtrage, details, statut et notes internes">
      <Card>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
            placeholder="Recherche"
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
          />
          <select
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="">Tous statuts</option>
            {LEAD_STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
            value={filters.intent}
            onChange={(event) => setFilters((prev) => ({ ...prev, intent: event.target.value }))}
          >
            <option value="">Toutes intentions</option>
            {LEAD_INTENTS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
            value={filters.source}
            onChange={(event) => setFilters((prev) => ({ ...prev, source: event.target.value }))}
          >
            <option value="">Toutes sources</option>
            {LEAD_SOURCES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <section className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row) => {
              const active = row.id === selectedId;
              return (
                <Card key={row.id}>
                  <button type="button" className="w-full text-left" onClick={() => setSelectedId(row.id)}>
                    <p className={`text-sm font-semibold ${active ? "text-[#E8DCC2]" : "text-white"}`}>{row.name}</p>
                    <p className="text-xs text-gray-400">
                      {row.phone} • {row.city}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {row.status} • {row.intent} • {dt(row.createdAt)}
                    </p>
                  </button>
                </Card>
              );
            })
          ) : (
            <Card>
              <p className="text-sm text-gray-300">Aucun lead trouve.</p>
            </Card>
          )}
        </div>

        <Card>
          {item ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Detail lead</p>
              <p className="text-xs text-gray-300">
                {item.name} • {item.phone} • {item.email || "-"}
              </p>
              <p className="text-xs text-gray-400">
                Source: {item.source} • Intention: {item.intent}
              </p>
              <select
                className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {LEAD_STATUSES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
              <textarea
                rows={6}
                className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 text-xs text-gray-100"
                placeholder="Notes internes"
                value={internalNotes}
                onChange={(event) => setInternalNotes(event.target.value)}
              />
              <SaveButton onClick={save} />
              <div className="text-xs text-gray-400">
                <p>Commandes liees: {(item.orders || []).length}</p>
                <p>Estimations liees: {(item.estimates || []).length}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-300">Selectionnez un lead.</p>
          )}
        </Card>
      </section>
    </AdminShell>
  );
}

export function MetAdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const listPath = useMemo(
    () => buildPath("/api/admin/met/orders", { limit: "120", status: statusFilter, q: search }),
    [search, statusFilter],
  );
  const listQuery = useApi<Order>(listPath);
  const rows = listQuery.data?.items || [];

  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const detailPath = selectedId ? `/api/admin/met/orders/${selectedId}` : "";
  const detailQuery = useApi<Order>(detailPath, Boolean(selectedId));
  const item = detailQuery.data?.item;

  const [status, setStatus] = useState("SUBMITTED");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [city, setCity] = useState("");
  const [deliveryFeeCfa, setDeliveryFeeCfa] = useState("0");
  const [subtotalCfa, setSubtotalCfa] = useState("0");
  const [totalCfa, setTotalCfa] = useState("0");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  useEffect(() => {
    setStatus(t(item?.status) || "SUBMITTED");
    setDeliveryAddress(t(item?.deliveryAddress));
    setCity(t(item?.city));
    setDeliveryFeeCfa(String(n(item?.deliveryFeeCfa)));
    setSubtotalCfa(String(n(item?.subtotalCfa)));
    setTotalCfa(String(n(item?.totalCfa)));
    setNotes(t(item?.notes));
    setInternalNotes(t(item?.internalNotes));
  }, [item?.id, item?.status, item?.deliveryAddress, item?.city, item?.deliveryFeeCfa, item?.subtotalCfa, item?.totalCfa, item?.notes, item?.internalNotes]);

  async function save() {
    if (!item) return;
    await apiRequest(`/api/admin/met/orders/${item.id}`, "PATCH", {
      status,
      deliveryAddress: t(deliveryAddress) || null,
      city: t(city) || null,
      deliveryFeeCfa: n(deliveryFeeCfa),
      subtotalCfa: n(subtotalCfa),
      totalCfa: n(totalCfa),
      notes: t(notes) || null,
      internalNotes: t(internalNotes) || null,
    });
    await Promise.all([listQuery.refetch(), detailQuery.refetch()]);
  }

  return (
    <AdminShell title="Commandes briques" subtitle="Workflow de production/livraison + ajustements de total">
      <Card>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
            placeholder="Recherche ville/adresse"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Tous statuts</option>
            {ORDER_STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <section className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row) => (
              <Card key={row.id}>
                <button type="button" className="w-full text-left" onClick={() => setSelectedId(row.id)}>
                  <p className="text-sm font-semibold text-white">Commande {row.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-400">
                    {row.lead?.name || "Lead inconnu"} • {row.city || "-"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {row.status} • {cfa(row.totalCfa)} • {dt(row.createdAt)}
                  </p>
                </button>
              </Card>
            ))
          ) : (
            <Card>
              <p className="text-sm text-gray-300">Aucune commande.</p>
            </Card>
          )}
        </div>

        <Card>
          {item ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Detail commande</p>
              <select
                className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {ORDER_STATUSES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100"
                placeholder="Ville"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
              <input
                className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100"
                placeholder="Adresse livraison"
                value={deliveryAddress}
                onChange={(event) => setDeliveryAddress(event.target.value)}
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100"
                  placeholder="Sous-total"
                  value={subtotalCfa}
                  onChange={(event) => setSubtotalCfa(event.target.value)}
                />
                <input
                  className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100"
                  placeholder="Livraison"
                  value={deliveryFeeCfa}
                  onChange={(event) => setDeliveryFeeCfa(event.target.value)}
                />
                <input
                  className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100"
                  placeholder="Total"
                  value={totalCfa}
                  onChange={(event) => setTotalCfa(event.target.value)}
                />
              </div>
              <textarea
                rows={3}
                className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 text-xs text-gray-100"
                placeholder="Notes client"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
              <textarea
                rows={4}
                className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 text-xs text-gray-100"
                placeholder="Notes internes"
                value={internalNotes}
                onChange={(event) => setInternalNotes(event.target.value)}
              />
              <SaveButton onClick={save} />
              <p className="text-xs text-gray-400">Articles: {(item.items || []).length}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-300">Selectionnez une commande.</p>
          )}
        </Card>
      </section>
    </AdminShell>
  );
}

export function MetAdminEstimatesPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const listPath = useMemo(
    () => buildPath("/api/admin/met/estimate-requests", { limit: "120", status: statusFilter, q: search }),
    [search, statusFilter],
  );
  const listQuery = useApi<Estimate>(listPath);
  const rows = listQuery.data?.items || [];

  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const detailPath = selectedId ? `/api/admin/met/estimate-requests/${selectedId}` : "";
  const detailQuery = useApi<Estimate>(detailPath, Boolean(selectedId));
  const item = detailQuery.data?.item;

  const [status, setStatus] = useState("NEW");
  const [internalNotes, setInternalNotes] = useState("");
  useEffect(() => {
    setStatus(t(item?.status) || "NEW");
    setInternalNotes(t(item?.internalNotes));
  }, [item?.id, item?.status, item?.internalNotes]);

  async function save() {
    if (!item) return;
    await apiRequest(`/api/admin/met/estimate-requests/${item.id}`, "PATCH", {
      status,
      internalNotes: t(internalNotes) || null,
    });
    await Promise.all([listQuery.refetch(), detailQuery.refetch()]);
  }

  return (
    <AdminShell title="Demandes de devis" subtitle="Suivi du pipeline de devis et acces au plan">
      <Card>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
            placeholder="Recherche ville/brief"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Tous statuts</option>
            {ESTIMATE_STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <section className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row) => (
              <Card key={row.id}>
                <button type="button" className="w-full text-left" onClick={() => setSelectedId(row.id)}>
                  <p className="text-sm font-semibold text-white">Demande {row.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-400">
                    {row.projectCity} • {row.status}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{dt(row.createdAt)}</p>
                </button>
              </Card>
            ))
          ) : (
            <Card>
              <p className="text-sm text-gray-300">Aucune demande.</p>
            </Card>
          )}
        </div>

        <Card>
          {item ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Detail demande</p>
              <p className="text-xs text-gray-300">
                {item.lead?.name || "Lead inconnu"} • {item.lead?.phone || "-"}
              </p>
              <select
                className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-white"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {ESTIMATE_STATUSES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
              <textarea
                rows={6}
                className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 text-xs text-gray-100"
                placeholder="Notes internes / quote notes"
                value={internalNotes}
                onChange={(event) => setInternalNotes(event.target.value)}
              />
              <a
                className="inline-block text-xs text-emerald-300 underline"
                href={`/api/admin/met/estimate-requests/${item.id}/file`}
                target="_blank"
                rel="noreferrer"
              >
                Telecharger le plan
              </a>
              <SaveButton onClick={save} />
            </div>
          ) : (
            <p className="text-sm text-gray-300">Selectionnez une demande.</p>
          )}
        </Card>
      </section>
    </AdminShell>
  );
}

export function MetAdminProductsPage() {
  const listQuery = useApi<Product>("/api/admin/met/products");
  const rows = listQuery.data?.items || [];
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);
  const item = rows.find((row) => row.id === selectedId) || null;

  const [form, setForm] = useState({
    id: "",
    name: "",
    sku: "",
    description: "",
    unit: "PIECE",
    priceCfa: "0",
    piecesPerPallet: "0",
    compressiveStrengthMpa: "",
    length: "",
    width: "",
    height: "",
    isActive: true,
  });

  useEffect(() => {
    if (!item) return;
    setForm({
      id: item.id,
      name: item.name,
      sku: item.sku,
      description: t(item.description),
      unit: item.unit,
      priceCfa: String(n(item.priceCfa)),
      piecesPerPallet: String(n(item.piecesPerPallet)),
      compressiveStrengthMpa: t(item.compressiveStrengthMpa),
      length: t(item.dimensionsMm?.length),
      width: t(item.dimensionsMm?.width),
      height: t(item.dimensionsMm?.height),
      isActive: Boolean(item.isActive),
    });
  }, [item]);

  async function createNew() {
    const payload = {
      name: form.name,
      sku: form.sku,
      description: t(form.description) || null,
      unit: form.unit as "PIECE" | "PALLET",
      priceCfa: n(form.priceCfa),
      piecesPerPallet: n(form.piecesPerPallet),
      compressiveStrengthMpa: t(form.compressiveStrengthMpa) ? n(form.compressiveStrengthMpa) : null,
      dimensionsMm: {
        length: t(form.length) ? n(form.length) : undefined,
        width: t(form.width) ? n(form.width) : undefined,
        height: t(form.height) ? n(form.height) : undefined,
      },
      isActive: form.isActive,
    };
    await apiRequest("/api/admin/met/products", "POST", payload);
    await listQuery.refetch();
  }

  async function updateExisting() {
    if (!form.id) return;
    const payload = {
      name: form.name,
      sku: form.sku,
      description: t(form.description) || null,
      unit: form.unit as "PIECE" | "PALLET",
      priceCfa: n(form.priceCfa),
      piecesPerPallet: n(form.piecesPerPallet),
      compressiveStrengthMpa: t(form.compressiveStrengthMpa) ? n(form.compressiveStrengthMpa) : null,
      dimensionsMm: {
        length: t(form.length) ? n(form.length) : undefined,
        width: t(form.width) ? n(form.width) : undefined,
        height: t(form.height) ? n(form.height) : undefined,
      },
      isActive: form.isActive,
    };
    await apiRequest(`/api/admin/met/products/${form.id}`, "PATCH", payload);
    await listQuery.refetch();
  }

  return (
    <AdminShell title="Produits briques" subtitle="CRUD tenant met uniquement">
      <section className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row) => (
              <Card key={row.id}>
                <button type="button" className="w-full text-left" onClick={() => setSelectedId(row.id)}>
                  <p className="text-sm font-semibold text-white">{row.name}</p>
                  <p className="text-xs text-gray-400">
                    {row.sku} • {row.unit} • {cfa(row.priceCfa)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{row.isActive ? "Actif" : "Inactif"}</p>
                </button>
              </Card>
            ))
          ) : (
            <Card>
              <p className="text-sm text-gray-300">Aucun produit.</p>
            </Card>
          )}
        </div>

        <Card>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Edition produit</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Nom" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="SKU" value={form.sku} onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))} />
              <select className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" value={form.unit} onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}>
                <option value="PIECE">PIECE</option>
                <option value="PALLET">PALLET</option>
              </select>
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Prix FCFA" value={form.priceCfa} onChange={(event) => setForm((prev) => ({ ...prev, priceCfa: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Pieces / palette" value={form.piecesPerPallet} onChange={(event) => setForm((prev) => ({ ...prev, piecesPerPallet: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Resistance MPa" value={form.compressiveStrengthMpa} onChange={(event) => setForm((prev) => ({ ...prev, compressiveStrengthMpa: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Longueur mm" value={form.length} onChange={(event) => setForm((prev) => ({ ...prev, length: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Largeur mm" value={form.width} onChange={(event) => setForm((prev) => ({ ...prev, width: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Hauteur mm" value={form.height} onChange={(event) => setForm((prev) => ({ ...prev, height: event.target.value }))} />
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
                Produit actif
              </label>
            </div>
            <textarea className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 text-xs text-gray-100" rows={4} placeholder="Description" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            <div className="flex flex-wrap gap-2">
              <SaveButton onClick={createNew} label="Creer" />
              <SaveButton onClick={updateExisting} label="Mettre a jour" />
              <button type="button" className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200" onClick={() => setForm({ id: "", name: "", sku: "", description: "", unit: "PIECE", priceCfa: "0", piecesPerPallet: "0", compressiveStrengthMpa: "", length: "", width: "", height: "", isActive: true })}>Nouveau</button>
            </div>
          </div>
        </Card>
      </section>
    </AdminShell>
  );
}

export function MetAdminPlansPage() {
  const listQuery = useApi<Plan>("/api/admin/met/plans");
  const rows = listQuery.data?.items || [];
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);
  const item = rows.find((row) => row.id === selectedId) || null;

  const [form, setForm] = useState({
    id: "",
    title: "",
    slug: "",
    description: "",
    bedrooms: "",
    bathrooms: "",
    floors: "",
    areaM2: "",
    tags: "",
    thumbnailUrl: "",
    fileUrl: "",
    isActive: true,
  });

  useEffect(() => {
    if (!item) return;
    setForm({
      id: item.id,
      title: item.title,
      slug: item.slug,
      description: t(item.description),
      bedrooms: t(item.bedrooms),
      bathrooms: t(item.bathrooms),
      floors: t(item.floors),
      areaM2: t(item.areaM2),
      tags: (item.tags || []).join(", "),
      thumbnailUrl: t(item.thumbnailUrl),
      fileUrl: t(item.fileUrl),
      isActive: Boolean(item.isActive),
    });
  }, [item]);

  function payloadFromForm() {
    return {
      title: form.title,
      slug: t(form.slug) || undefined,
      description: t(form.description) || null,
      bedrooms: t(form.bedrooms) ? n(form.bedrooms) : null,
      bathrooms: t(form.bathrooms) ? n(form.bathrooms) : null,
      floors: t(form.floors) ? n(form.floors) : null,
      areaM2: t(form.areaM2) ? n(form.areaM2) : null,
      tags: form.tags
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      thumbnailUrl: t(form.thumbnailUrl) || null,
      fileUrl: t(form.fileUrl) || null,
      isActive: form.isActive,
    };
  }

  async function createNew() {
    await apiRequest("/api/admin/met/plans", "POST", payloadFromForm());
    await listQuery.refetch();
  }

  async function updateExisting() {
    if (!form.id) return;
    await apiRequest(`/api/admin/met/plans/${form.id}`, "PATCH", payloadFromForm());
    await listQuery.refetch();
  }

  return (
    <AdminShell title="Plans" subtitle="CRUD plans, tags, thumbnail et PDF">
      <section className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row) => (
              <Card key={row.id}>
                <button type="button" className="w-full text-left" onClick={() => setSelectedId(row.id)}>
                  <p className="text-sm font-semibold text-white">{row.title}</p>
                  <p className="text-xs text-gray-400">
                    {row.slug} • {row.bedrooms ?? "-"} ch • {row.floors ?? "-"} etage(s)
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{row.isActive ? "Actif" : "Inactif"}</p>
                </button>
              </Card>
            ))
          ) : (
            <Card>
              <p className="text-sm text-gray-300">Aucun plan.</p>
            </Card>
          )}
        </div>

        <Card>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Edition plan</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Titre" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Slug" value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Chambres" value={form.bedrooms} onChange={(event) => setForm((prev) => ({ ...prev, bedrooms: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Salles de bain" value={form.bathrooms} onChange={(event) => setForm((prev) => ({ ...prev, bathrooms: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Etages" value={form.floors} onChange={(event) => setForm((prev) => ({ ...prev, floors: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Surface m2" value={form.areaM2} onChange={(event) => setForm((prev) => ({ ...prev, areaM2: event.target.value }))} />
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
                Plan actif
              </label>
            </div>
            <input className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Tags (separes par virgule)" value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} />
            <input className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="URL thumbnail" value={form.thumbnailUrl} onChange={(event) => setForm((prev) => ({ ...prev, thumbnailUrl: event.target.value }))} />
            <input className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="URL PDF" value={form.fileUrl} onChange={(event) => setForm((prev) => ({ ...prev, fileUrl: event.target.value }))} />
            <textarea className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 text-xs text-gray-100" rows={4} placeholder="Description" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            <div className="flex flex-wrap gap-2">
              <SaveButton onClick={createNew} label="Creer" />
              <SaveButton onClick={updateExisting} label="Mettre a jour" />
              <button type="button" className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200" onClick={() => setForm({ id: "", title: "", slug: "", description: "", bedrooms: "", bathrooms: "", floors: "", areaM2: "", tags: "", thumbnailUrl: "", fileUrl: "", isActive: true })}>Nouveau</button>
            </div>
          </div>
        </Card>
      </section>
    </AdminShell>
  );
}

export function MetAdminProjectsPage() {
  const listQuery = useApi<Project>("/api/admin/met/projects");
  const rows = listQuery.data?.items || [];
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const detailPath = selectedId ? `/api/admin/met/projects/${selectedId}` : "";
  const detailQuery = useApi<Project>(detailPath, Boolean(selectedId));
  const item = detailQuery.data?.item;

  const [form, setForm] = useState({
    id: "",
    title: "",
    slug: "",
    summary: "",
    description: "",
    location: "",
    status: "PUBLISHED",
    isFeatured: false,
    mediaText: "",
  });

  useEffect(() => {
    const project = item || rows.find((row) => row.id === selectedId) || null;
    if (!project) return;
    const mediaJson = JSON.stringify(project.media || [], null, 2);
    setForm({
      id: project.id,
      title: project.title,
      slug: project.slug,
      summary: t(project.summary),
      description: t(project.description),
      location: t(project.location),
      status: t(project.status) || "PUBLISHED",
      isFeatured: Boolean(project.isFeatured),
      mediaText: mediaJson,
    });
  }, [item, rows, selectedId]);

  function mediaPayloadFromText() {
    try {
      const parsed = JSON.parse(form.mediaText || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry, index) => ({
          assetUrl: t((entry as any)?.assetUrl),
          caption: t((entry as any)?.caption) || null,
          sortOrder: Number.isFinite(Number((entry as any)?.sortOrder))
            ? Number((entry as any)?.sortOrder)
            : index + 1,
        }))
        .filter((entry) => entry.assetUrl);
    } catch {
      return [];
    }
  }

  async function createNew() {
    await apiRequest("/api/admin/met/projects", "POST", {
      title: form.title,
      slug: t(form.slug) || undefined,
      summary: t(form.summary) || null,
      description: t(form.description) || null,
      location: t(form.location) || null,
      status: form.status,
      isFeatured: form.isFeatured,
      media: mediaPayloadFromText(),
    });
    await listQuery.refetch();
  }

  async function updateExisting() {
    if (!form.id) return;
    await apiRequest(`/api/admin/met/projects/${form.id}`, "PATCH", {
      title: form.title,
      slug: t(form.slug) || undefined,
      summary: t(form.summary) || null,
      description: t(form.description) || null,
      location: t(form.location) || null,
      status: form.status,
      isFeatured: form.isFeatured,
      media: mediaPayloadFromText(),
    });
    await Promise.all([listQuery.refetch(), detailQuery.refetch()]);
  }

  return (
    <AdminShell title="Realisations" subtitle="CRUD projets + galerie media">
      <section className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row) => (
              <Card key={row.id}>
                <button type="button" className="w-full text-left" onClick={() => setSelectedId(row.id)}>
                  <p className="text-sm font-semibold text-white">{row.title}</p>
                  <p className="text-xs text-gray-400">
                    {row.slug} • {row.status} • {row.isFeatured ? "Featured" : "Standard"}
                  </p>
                </button>
              </Card>
            ))
          ) : (
            <Card>
              <p className="text-sm text-gray-300">Aucun projet.</p>
            </Card>
          )}
        </div>

        <Card>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Edition projet</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Titre" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Slug" value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} />
              <input className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Localisation" value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
              <select className="rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                {PROJECT_STATUSES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-gray-200">
                <input type="checkbox" checked={form.isFeatured} onChange={(event) => setForm((prev) => ({ ...prev, isFeatured: event.target.checked }))} />
                Projet en avant
              </label>
            </div>
            <textarea className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 text-xs text-gray-100" rows={3} placeholder="Resume" value={form.summary} onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))} />
            <textarea className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 text-xs text-gray-100" rows={5} placeholder="Description" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            <textarea className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 font-mono text-[11px] text-gray-100" rows={8} placeholder='Media JSON [{"assetUrl":"...","caption":"...","sortOrder":1}]' value={form.mediaText} onChange={(event) => setForm((prev) => ({ ...prev, mediaText: event.target.value }))} />
            <div className="flex flex-wrap gap-2">
              <SaveButton onClick={createNew} label="Creer" />
              <SaveButton onClick={updateExisting} label="Mettre a jour" />
              <button type="button" className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200" onClick={() => setForm({ id: "", title: "", slug: "", summary: "", description: "", location: "", status: "PUBLISHED", isFeatured: false, mediaText: "[]" })}>Nouveau</button>
            </div>
          </div>
        </Card>
      </section>
    </AdminShell>
  );
}

export function MetAdminBlogPage() {
  const listQuery = useApi<BlogPost>("/api/admin/met/blog-posts");
  const rows = listQuery.data?.items || [];
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);
  const item = rows.find((row) => row.id === selectedId) || null;

  const [form, setForm] = useState({
    id: "",
    slug: "",
    title: "",
    excerpt: "",
    contentMarkdown: "",
    coverImageUrl: "",
    publishedAt: "",
  });
  useEffect(() => {
    if (!item) return;
    const iso = item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 16) : "";
    setForm({
      id: item.id,
      slug: item.slug,
      title: item.title,
      excerpt: t(item.excerpt),
      contentMarkdown: t(item.contentMarkdown),
      coverImageUrl: t(item.coverImageUrl),
      publishedAt: iso,
    });
  }, [item]);

  function payloadFromForm() {
    return {
      slug: form.slug,
      title: form.title,
      excerpt: t(form.excerpt) || null,
      contentMarkdown: t(form.contentMarkdown) || null,
      coverImageUrl: t(form.coverImageUrl) || null,
      publishedAt: t(form.publishedAt) ? new Date(form.publishedAt).toISOString() : null,
    };
  }

  async function createNew() {
    await apiRequest("/api/admin/met/blog-posts", "POST", payloadFromForm());
    await listQuery.refetch();
  }

  async function updateExisting() {
    if (!form.id) return;
    await apiRequest(`/api/admin/met/blog-posts/${form.id}`, "PATCH", payloadFromForm());
    await listQuery.refetch();
  }

  return (
    <AdminShell title="Blog" subtitle="CRUD articles, slug et publication">
      <section className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row) => (
              <Card key={row.id}>
                <button type="button" className="w-full text-left" onClick={() => setSelectedId(row.id)}>
                  <p className="text-sm font-semibold text-white">{row.title}</p>
                  <p className="text-xs text-gray-400">{row.slug}</p>
                  <p className="mt-1 text-xs text-gray-500">{row.publishedAt ? `Publie: ${dt(row.publishedAt)}` : "Brouillon"}</p>
                </button>
              </Card>
            ))
          ) : (
            <Card>
              <p className="text-sm text-gray-300">Aucun article.</p>
            </Card>
          )}
        </div>

        <Card>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Edition article</p>
            <input className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Slug" value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} />
            <input className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Titre" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
            <textarea className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 text-xs text-gray-100" rows={3} placeholder="Excerpt" value={form.excerpt} onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))} />
            <input className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="URL image cover" value={form.coverImageUrl} onChange={(event) => setForm((prev) => ({ ...prev, coverImageUrl: event.target.value }))} />
            <input type="datetime-local" className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" value={form.publishedAt} onChange={(event) => setForm((prev) => ({ ...prev, publishedAt: event.target.value }))} />
            <textarea className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 font-mono text-[11px] text-gray-100" rows={10} placeholder="Markdown content" value={form.contentMarkdown} onChange={(event) => setForm((prev) => ({ ...prev, contentMarkdown: event.target.value }))} />
            <div className="flex flex-wrap gap-2">
              <SaveButton onClick={createNew} label="Creer" />
              <SaveButton onClick={updateExisting} label="Mettre a jour" />
              <button type="button" className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200" onClick={() => setForm({ id: "", slug: "", title: "", excerpt: "", contentMarkdown: "", coverImageUrl: "", publishedAt: "" })}>Nouveau</button>
            </div>
          </div>
        </Card>
      </section>
    </AdminShell>
  );
}

export function MetAdminMediaPage() {
  const estimateQuery = useApi<Estimate>(buildPath("/api/admin/met/estimate-requests", { limit: "200" }));
  const estimates = estimateQuery.data?.items || [];
  const withFiles = estimates.filter((entry) => t(entry.planFileUrl));

  return (
    <AdminShell title="Media" subtitle="Fichiers plans/devis tenant met">
      <Card>
        <p className="text-sm text-gray-200">
          Cette vue recense les fichiers de demandes de devis stockes sous <code>uploads/met/estimate-requests/...</code>.
        </p>
      </Card>
      <div className="space-y-2">
        {withFiles.length ? (
          withFiles.map((entry) => (
            <Card key={entry.id}>
              <p className="text-sm text-white">Demande {entry.id.slice(0, 8)}</p>
              <p className="text-xs text-gray-400">
                {entry.projectCity} • {entry.status} • {dt(entry.createdAt)}
              </p>
              <a
                className="mt-2 inline-block text-xs text-emerald-300 underline"
                href={`/api/admin/met/estimate-requests/${entry.id}/file`}
                target="_blank"
                rel="noreferrer"
              >
                Telecharger fichier
              </a>
            </Card>
          ))
        ) : (
          <Card>
            <p className="text-sm text-gray-300">Aucun fichier disponible.</p>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}

export function MetAdminSettingsPage() {
  const listQuery = useApi<SettingRow>("/api/admin/met/settings");
  const rows = listQuery.data?.items || [];
  const [selectedKey, setSelectedKey] = useState("homepage.hero");

  const current = rows.find((row) => row.key === selectedKey) || null;
  const [key, setKey] = useState("homepage.hero");
  const [valueText, setValueText] = useState("{\n  \"title\": \"Maison en Terre\"\n}");
  useEffect(() => {
    if (!current) return;
    setKey(current.key);
    setValueText(JSON.stringify(current.value || {}, null, 2));
  }, [current]);

  async function save() {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(valueText || "{}");
    } catch {
      throw new Error("JSON invalide");
    }
    await apiRequest("/api/admin/met/settings", "PATCH", { key: t(key), value: parsed });
    await listQuery.refetch();
    setSelectedKey(t(key));
  }

  return (
    <AdminShell title="Settings" subtitle="Regles de livraison/pricing et contenus globaux">
      <section className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          {rows.length ? (
            rows.map((row) => (
              <Card key={row.id}>
                <button type="button" className="w-full text-left" onClick={() => setSelectedKey(row.key)}>
                  <p className="text-sm font-semibold text-white">{row.key}</p>
                  <p className="text-xs text-gray-500">Maj: {dt(row.updatedAt)}</p>
                </button>
              </Card>
            ))
          ) : (
            <Card>
              <p className="text-sm text-gray-300">Aucun parametre.</p>
            </Card>
          )}
        </div>

        <Card>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">Edition setting</p>
            <input className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" placeholder="Cle setting" value={key} onChange={(event) => setKey(event.target.value)} />
            <textarea className="w-full rounded border border-gray-600 bg-gray-950 px-2 py-2 font-mono text-[11px] text-gray-100" rows={14} value={valueText} onChange={(event) => setValueText(event.target.value)} />
            <SaveButton onClick={save} />
          </div>
        </Card>
      </section>
    </AdminShell>
  );
}
