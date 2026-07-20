import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Bus, CalendarClock, ClipboardList, CreditCard, Download, Gauge, Loader2, Menu, QrCode, Route as RouteIcon, Search, Settings, Ticket, Users, X } from "lucide-react";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime, formatXof, type MobilityBootstrap } from "./mobility-core";

export type MobilityAdminSection = "overview" | "buses" | "routes" | "schedules" | "trips" | "bookings" | "tickets" | "payments" | "bus-requests" | "demonstrations" | "orders" | "waitlist" | "validations";

const adminNav: Array<[MobilityAdminSection, string, string, any]> = [
  ["overview", "Vue d'ensemble", "/admin", BarChart3],
  ["buses", "Bus", "/admin/bus", Bus],
  ["routes", "Lignes", "/admin/trajets", RouteIcon],
  ["schedules", "Horaires", "/admin/horaires", CalendarClock],
  ["trips", "Voyages", "/admin/voyages", Gauge],
  ["bookings", "Réservations", "/admin/reservations", ClipboardList],
  ["tickets", "Billets", "/admin/billets", Ticket],
  ["payments", "Paiements", "/admin/paiements", CreditCard],
  ["bus-requests", "Réservations bus", "/admin/reservations-bus", Bus],
  ["demonstrations", "Démonstrations", "/admin/demonstrations", Users],
  ["orders", "Commandes bus", "/admin/commandes-bus", ClipboardList],
  ["waitlist", "Liste prioritaire", "/admin/liste-prioritaire", Users],
  ["validations", "Contrôles", "/admin/controles", QrCode],
];

const labels: Record<MobilityAdminSection, string> = {
  overview: "Pilotage mobilité",
  buses: "Gestion des bus",
  routes: "Lignes et itinéraires",
  schedules: "Horaires récurrents",
  trips: "Voyages planifiés",
  bookings: "Réservations passagers",
  tickets: "Billets numériques",
  payments: "Paiements",
  "bus-requests": "Réservations de bus entier",
  demonstrations: "Demandes de démonstration",
  orders: "Commandes de bus",
  waitlist: "Liste prioritaire",
  validations: "Historique des contrôles",
};

function AdminShell({ section, children }: { section: MobilityAdminSection; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="min-h-screen bg-[#eef0ed] text-[#171917]"><header className="sticky top-0 z-40 flex h-16 items-center border-b border-black/10 bg-white px-4 lg:hidden"><button type="button" onClick={() => setOpen((value) => !value)} className="grid h-11 w-11 place-items-center border border-black/15" aria-label="Menu administration">{open ? <X /> : <Menu />}</button><img src="/brand/agoojiye/logo/AGOOJIYE_wordmark_transparent.png" alt="AGOOJIYE" width={1116} height={219} className="ml-4 h-8 w-auto" /></header><aside className={`fixed inset-y-0 left-0 z-30 w-72 overflow-y-auto bg-[#0b0d0c] px-4 pb-8 pt-5 text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0 pt-20" : "-translate-x-full"}`}><a href="/admin" className="block border-b border-white/10 pb-5"><img src="/brand/agoojiye/logo/AGOOJIYE_wordmark_gold_transparent.png" alt="AGOOJIYE" width={1109} height={201} className="h-9 w-auto" /><span className="mt-2 block text-xs font-bold uppercase text-[#e0b84f]">Administration mobilité</span></a><nav className="mt-5 grid gap-1">{adminNav.map(([key, label, href, Icon]) => <a key={key} href={href} className={`flex min-h-11 items-center gap-3 px-3 text-sm font-semibold ${section === key ? "bg-[#d6a82e] text-[#111]" : "text-white/70 hover:bg-white/5 hover:text-white"}`}><Icon size={18} />{label}</a>)}</nav><div className="mt-6 border-t border-white/10 pt-5"><a href="/controle" className="flex min-h-11 items-center gap-3 px-3 text-sm font-semibold text-white/70"><QrCode size={18} />Contrôle embarquement</a><a href="/" className="flex min-h-11 items-center gap-3 px-3 text-sm font-semibold text-white/70"><Settings size={18} />Voir le site</a></div></aside><main className="lg:pl-72"><div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6"><div className="mb-7"><p className="text-xs font-bold uppercase text-[#805f12]">AGOOJIYE Operations</p><h1 className="mt-2 text-3xl font-bold">{labels[section]}</h1></div>{children}</div></main></div>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="border-l-4 border-[#15803d] bg-white p-5"><p className="text-sm text-black/50">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p>{detail ? <p className="mt-1 text-xs text-black/45">{detail}</p> : null}</div>;
}

function Overview() {
  const dashboard = useQuery<any>({ queryKey: ["/api/admin/agoojye/mobility/dashboard"], queryFn: () => apiRequest("/api/admin/agoojye/mobility/dashboard", "GET"), refetchInterval: 60_000 });
  if (dashboard.isLoading) return <p className="py-12 text-center text-sm text-black/50">Chargement des opérations…</p>;
  if (dashboard.isError) return <p className="border border-red-200 bg-red-50 p-4 text-red-800">{(dashboard.error as Error).message}</p>;
  const metrics = dashboard.data.metrics;
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Voyages aujourd'hui" value={metrics.tripsToday} /><Metric label="Billets vendus aujourd'hui" value={metrics.ticketsSoldToday} /><Metric label="Revenu aujourd'hui" value={formatXof(metrics.revenueTodayXof)} detail="Paiements confirmés" /><Metric label="Réservations actives" value={metrics.activeBookings} /><Metric label="Demandes bus en attente" value={metrics.pendingFullBusRequests} /><Metric label="Démonstrations en attente" value={metrics.pendingDemonstrations} /><Metric label="Commandes en attente" value={metrics.pendingOrders} /></div><div className="mt-7 grid gap-6 xl:grid-cols-2"><section className="bg-white p-5"><h2 className="text-xl font-bold">Paiements récents</h2><div className="mt-4 overflow-x-auto"><SimpleTable items={dashboard.data.recentPayments} columns={["externalReference", "amountXof", "provider", "status", "createdAt"]} /></div></section><section className="bg-white p-5"><h2 className="text-xl font-bold">Validations récentes</h2><div className="mt-4 overflow-x-auto"><SimpleTable items={dashboard.data.recentValidations} columns={["ticketId", "tripId", "result", "validatedAt"]} /></div></section></div></>;
}

const resourceColumns: Record<Exclude<MobilityAdminSection, "overview">, string[]> = {
  buses: ["name", "reference", "capacity", "availabilityStatus", "specificationsStatus", "active"],
  routes: ["origin", "destination", "boardingPoint", "durationMinutes", "baseFareXof", "active"],
  schedules: ["name", "routeId", "busId", "departureTime", "daysOfWeek", "active"],
  trips: ["routeId", "busId", "departureAt", "arrivalAt", "fareXof", "status", "bookingOpen"],
  bookings: ["reference", "contactEmail", "contactPhone", "passengerCount", "totalXof", "status", "paymentStatus", "createdAt"],
  tickets: ["reference", "bookingId", "tripId", "seatNumber", "status", "issuedAt"],
  payments: ["externalReference", "bookingId", "amountXof", "method", "provider", "status", "demo", "createdAt"],
  "bus-requests": ["reference", "customerType", "organizationName", "contactName", "origin", "destination", "passengerCount", "status", "createdAt"],
  demonstrations: ["reference", "requestType", "fullName", "organization", "city", "participantCount", "status", "createdAt"],
  orders: ["reference", "organization", "contactName", "country", "city", "quantity", "intendedUse", "status", "createdAt"],
  waitlist: ["firstName", "lastName", "email", "city", "interests", "status", "createdAt"],
  validations: ["ticketId", "tripId", "validatorUserId", "result", "validatedAt"],
};

const editableStatusResources = new Set(["buses", "trips", "bookings", "tickets", "payments", "bus-requests", "demonstrations", "orders", "waitlist"]);

function displayValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (key.toLowerCase().includes("at") && typeof value === "string") return formatDateTime(value);
  if (key.toLowerCase().includes("xof")) return formatXof(Number(value));
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function SimpleTable({ items = [], columns, section, onPatch }: { items: any[]; columns: string[]; section?: MobilityAdminSection; onPatch?: (id: number, patch: Record<string, unknown>) => void }) {
  return <table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-black/15">{columns.map((column) => <th key={column} className="px-3 py-3 font-bold capitalize">{column.replace(/([A-Z])/g, " $1")}</th>)}{section && editableStatusResources.has(section) ? <th className="px-3 py-3">Action</th> : null}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b border-black/10 align-top hover:bg-black/[0.02]">{columns.map((column) => <td key={column} className="max-w-[260px] px-3 py-3"><span className="line-clamp-3">{displayValue(column, item[column])}</span></td>)}{section && editableStatusResources.has(section) ? <td className="px-3 py-2"><select aria-label={`Statut de l'élément ${item.id}`} value={item.status || item.availabilityStatus || "active"} onChange={(event) => onPatch?.(item.id, section === "buses" ? { availabilityStatus: event.target.value } : { status: event.target.value })} className="h-9 border border-black/15 bg-white px-2"><option value="new">Nouveau</option><option value="active">Actif</option><option value="available">Disponible</option><option value="planned">Planifié</option><option value="scheduled">Programmé</option><option value="boarding">Embarquement</option><option value="departed">Parti</option><option value="completed">Terminé</option><option value="confirmed">Confirmé</option><option value="contacted">Contacté</option><option value="quoted">Devis envoyé</option><option value="paid">Payé</option><option value="pending">En attente</option><option value="cancelled">Annulé</option><option value="invalid">Invalidé</option><option value="maintenance">Maintenance</option></select></td> : null}</tr>)}</tbody></table>;
}

function exportCsv(section: string, items: any[]) {
  if (!items.length) return;
  const columns = [...new Set(items.flatMap((item) => Object.keys(item)))];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [columns.join(","), ...items.map((item) => columns.map((column) => escape(item[column])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `agoojiye-${section}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function CreateOperationsForm({ section }: { section: MobilityAdminSection }) {
  const bootstrap = useQuery<MobilityBootstrap>({ queryKey: ["/api/agoojye/mobility/bootstrap"], queryFn: () => apiRequest("/api/agoojye/mobility/bootstrap", "GET") });
  const [form, setForm] = useState<Record<string, any>>({ active: true, bookingOpen: true, capacity: 16, fareXof: 2500, baseFareXof: 2500, durationMinutes: 60, seatSelectionEnabled: true, availabilityStatus: "available", specificationsStatus: "placeholder", status: "scheduled" });
  const create = useMutation({ mutationFn: (payload: Record<string, any>) => apiRequest(`/api/admin/agoojye/mobility/${section}`, "POST", payload), onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`/api/admin/agoojye/mobility/${section}`] }); setForm((current) => ({ ...current, name: "", slug: "", reference: "", origin: "", destination: "" })); } });
  if (!["buses", "routes", "schedules", "trips"].includes(section)) return null;
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); const payload = { ...form }; if (section === "buses") { const capacity = Number(payload.capacity || 16); const columns = ["A", "B", "C", "D"]; payload.seatLayout = { columns: 4, aisleAfter: 2, labels: Array.from({ length: capacity }, (_, index) => `${Math.floor(index / 4) + 1}${columns[index % 4]}`) }; payload.amenities = ["Recharge USB", "Information voyageur"]; payload.category ||= "Bus électrique"; } create.mutate(payload); };
  return <details className="mb-6 border border-black/10 bg-white"><summary className="cursor-pointer px-5 py-4 font-bold">Créer un nouvel élément</summary><form onSubmit={submit} className="grid gap-4 border-t border-black/10 p-5 sm:grid-cols-2 lg:grid-cols-3">{section === "buses" ? <><AdminInput label="Nom" value={form.name} onChange={(v) => set("name", v)} required /><AdminInput label="Slug" value={form.slug} onChange={(v) => set("slug", v)} required /><AdminInput label="Référence" value={form.reference} onChange={(v) => set("reference", v)} required /><AdminInput label="Catégorie" value={form.category} onChange={(v) => set("category", v)} required /><AdminInput label="Capacité" type="number" value={form.capacity} onChange={(v) => set("capacity", Number(v))} required /><AdminInput label="Image" value={form.heroImageUrl} onChange={(v) => set("heroImageUrl", v)} /></> : null}{section === "routes" ? <><AdminInput label="Origine" value={form.origin} onChange={(v) => set("origin", v)} required /><AdminInput label="Destination" value={form.destination} onChange={(v) => set("destination", v)} required /><AdminInput label="Slug" value={form.slug} onChange={(v) => set("slug", v)} required /><AdminInput label="Embarquement" value={form.boardingPoint} onChange={(v) => set("boardingPoint", v)} required /><AdminInput label="Point d'arrivée" value={form.arrivalPoint} onChange={(v) => set("arrivalPoint", v)} required /><AdminInput label="Durée (min)" type="number" value={form.durationMinutes} onChange={(v) => set("durationMinutes", Number(v))} required /><AdminInput label="Tarif FCFA" type="number" value={form.baseFareXof} onChange={(v) => set("baseFareXof", Number(v))} required /></> : null}{section === "schedules" ? <><AdminSelect label="Ligne" value={form.routeId} onChange={(v) => set("routeId", Number(v))}>{bootstrap.data?.routes.map((route) => <option key={route.id} value={route.id}>{route.origin} → {route.destination}</option>)}</AdminSelect><AdminSelect label="Bus" value={form.busId} onChange={(v) => set("busId", Number(v))}>{bootstrap.data?.buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}</AdminSelect><AdminInput label="Nom" value={form.name} onChange={(v) => set("name", v)} required /><AdminInput label="Heure (HH:mm)" value={form.departureTime} onChange={(v) => set("departureTime", v)} required /></> : null}{section === "trips" ? <><AdminSelect label="Ligne" value={form.routeId} onChange={(v) => set("routeId", Number(v))}>{bootstrap.data?.routes.map((route) => <option key={route.id} value={route.id}>{route.origin} → {route.destination}</option>)}</AdminSelect><AdminSelect label="Bus" value={form.busId} onChange={(v) => set("busId", Number(v))}>{bootstrap.data?.buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name}</option>)}</AdminSelect><AdminInput label="Départ" type="datetime-local" value={form.departureAt} onChange={(v) => set("departureAt", v)} required /><AdminInput label="Arrivée" type="datetime-local" value={form.arrivalAt} onChange={(v) => set("arrivalAt", v)} required /><AdminInput label="Tarif FCFA" type="number" value={form.fareXof} onChange={(v) => set("fareXof", Number(v))} required /></> : null}<div className="flex items-end"><button type="submit" disabled={create.isPending} className="flex min-h-11 items-center gap-2 bg-[#15803d] px-4 font-bold text-white">{create.isPending ? <Loader2 className="animate-spin" size={17} /> : null}Créer</button></div>{create.isError ? <p className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{(create.error as Error).message}</p> : null}</form></details>;
}

function AdminInput({ label, value, onChange, type = "text", required = false }: { label: string; value: any; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="grid gap-1 text-sm font-semibold"><span>{label}</span><input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} required={required} className="h-11 border border-black/20 px-3 font-normal" /></label>;
}

function AdminSelect({ label, value, onChange, children }: { label: string; value: any; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="grid gap-1 text-sm font-semibold"><span>{label}</span><select value={value || ""} onChange={(event) => onChange(event.target.value)} required className="h-11 border border-black/20 bg-white px-3 font-normal"><option value="">Sélectionner</option>{children}</select></label>;
}

function ResourcePage({ section }: { section: Exclude<MobilityAdminSection, "overview"> }) {
  const [search, setSearch] = useState("");
  const query = useQuery<{ items: any[] }>({ queryKey: [`/api/admin/agoojye/mobility/${section}`], queryFn: () => apiRequest(`/api/admin/agoojye/mobility/${section}`, "GET") });
  const patch = useMutation({ mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) => apiRequest(`/api/admin/agoojye/mobility/${section}/${id}`, "PATCH", patch), onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/admin/agoojye/mobility/${section}`] }) });
  const items = useMemo(() => { const needle = search.trim().toLowerCase(); return (query.data?.items || []).filter((item) => !needle || JSON.stringify(item).toLowerCase().includes(needle)); }, [query.data, search]);
  return <><CreateOperationsForm section={section} /><div className="bg-white"><div className="flex flex-wrap items-center gap-3 border-b border-black/10 p-4"><label className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-3 text-black/35" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" className="h-11 w-full border border-black/15 pl-10 pr-3" /></label><span className="text-sm text-black/50">{items.length} résultat{items.length === 1 ? "" : "s"}</span>{["bookings", "tickets", "payments", "bus-requests", "demonstrations", "orders", "waitlist"].includes(section) ? <button type="button" onClick={() => exportCsv(section, items)} className="flex min-h-11 items-center gap-2 border border-black/15 px-3 text-sm font-bold"><Download size={17} />Exporter CSV</button> : null}</div>{query.isLoading ? <p className="p-8 text-center text-sm text-black/50">Chargement…</p> : query.isError ? <p className="m-5 border border-red-200 bg-red-50 p-4 text-red-800">{(query.error as Error).message}</p> : <div className="overflow-x-auto"><SimpleTable items={items} columns={resourceColumns[section]} section={section} onPatch={(id, values) => patch.mutate({ id, patch: values })} /></div>}</div></>;
}

export function AgoojiyeMobilityAdminPage({ section = "overview" }: { section?: MobilityAdminSection }) {
  return <AdminShell section={section}>{section === "overview" ? <Overview /> : <ResourcePage section={section} />}</AdminShell>;
}
