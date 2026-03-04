import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const MET_WHATSAPP = String(import.meta.env.VITE_MET_WHATSAPP_NUMBER || "22901010101").replace(/\D/g, "") || "22901010101";
const CANONICAL = "https://maisonsenterre.com";
const BRICKS_PER_M2 = 50;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"]);

type Product = { id: string; name: string; sku: string; description: string | null; unit: "PIECE" | "PALLET"; priceCfa: number; piecesPerPallet: number; isActive?: boolean; dimensionsMm?: { length?: number; width?: number; height?: number } | null; compressiveStrengthMpa?: string | number | null };
type Plan = { id: string; slug: string; title: string; description: string | null; bedrooms: number | null; bathrooms: number | null; floors: number | null; areaM2: string | number | null; tags: string[]; thumbnailUrl: string | null; fileUrl: string | null; isActive: boolean };
type ProjectMedia = { id: string; assetUrl: string; caption: string | null };
type Project = { id: string; slug: string; title: string; summary: string | null; description: string | null; location: string | null; media: ProjectMedia[] };
type BlogPost = { id: string; slug: string; title: string; excerpt: string | null; contentMarkdown: string | null; coverImageUrl: string | null; publishedAt: string | null };
type HeroSettings = { title?: string; subtitle?: string; ctaPrimary?: string; ctaSecondary?: string; ctaThird?: string };
type Mode = "M2" | "PIECES" | "PALLETS";

const t = (v: unknown) => String(v ?? "").trim();
const n = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const cfa = (v: unknown) => `${new Intl.NumberFormat("fr-FR").format(Math.max(0, Math.round(n(v))))} FCFA`;
const dte = (v: unknown) => { const raw = t(v); if (!raw) return "-"; const d = new Date(raw); return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("fr-FR"); };
const img = (v: unknown) => { const raw = t(v); if (!raw) return ""; if (raw.startsWith("/") || raw.startsWith("http://") || raw.startsWith("https://")) return raw; return `/${raw.replace(/^\/+/, "")}`; };
const wa = (m: string) => `https://wa.me/${MET_WHATSAPP}?text=${encodeURIComponent(m)}`;

function useMeta(title: string, description: string, path?: string) {
  useEffect(() => {
    document.title = title;
    const meta = (document.querySelector('meta[name="description"]') || document.createElement("meta")) as HTMLMetaElement;
    meta.setAttribute("name", "description");
    meta.setAttribute("content", description);
    if (!meta.parentNode) document.head.appendChild(meta);
    const canon = (document.querySelector('link[rel="canonical"]') || document.createElement("link")) as HTMLLinkElement;
    canon.setAttribute("rel", "canonical");
    canon.setAttribute("href", `${CANONICAL}${path || (typeof window !== "undefined" ? window.location.pathname : "/")}`);
    if (!canon.parentNode) document.head.appendChild(canon);
  }, [description, path, title]);
}

function md(markdown: string) {
  return markdown.replace(/\r/g, "").split("\n").filter((x) => x.trim().length).map((line, i) => {
    const raw = line.trim();
    if (raw.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold text-slate-900">{raw.slice(4)}</h3>;
    if (raw.startsWith("## ")) return <h2 key={i} className="text-xl font-semibold text-slate-900">{raw.slice(3)}</h2>;
    if (raw.startsWith("- ") || raw.startsWith("* ")) return <p key={i} className="pl-4 text-slate-700">• {raw.slice(2)}</p>;
    return <p key={i} className="text-slate-700 leading-7">{raw}</p>;
  });
}

function StickyWhatsApp() {
  return <a href={wa("Bonjour Maison en Terre, je souhaite des informations.")} target="_blank" rel="noreferrer" className="fixed bottom-4 right-4 z-50 rounded-full bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-emerald-600">WhatsApp</a>;
}

function Nav() {
  const links = [["Accueil", "/"], ["Maison modele", "/maison-modele"], ["Briques", "/briques"], ["Plans", "/plans"], ["Devis", "/devis"], ["Realisations", "/realisations"], ["Blog", "/blog"], ["Contact", "/contact"]] as const;
  return <nav className="border-b border-[#D8C7AB] bg-[#F5EFD9]/95 backdrop-blur"><div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 text-sm"><a href="/" className="mr-2 text-base font-bold text-met-primary">Maison en Terre</a>{links.map(([label, href]) => <a key={href} href={href} className="text-slate-700 hover:text-met-primary">{label}</a>)}<a href="/admin/met" className="ml-auto rounded border border-met-primary/35 px-3 py-1 text-xs font-semibold text-met-primary hover:bg-met-accent/70">Maison en Terre Admin</a></div></nav>;
}

function Shell({ title, subtitle, pageTitle, description, path, children }: { title: string; subtitle?: string; pageTitle: string; description: string; path?: string; children: React.ReactNode }) {
  useMeta(pageTitle, description, path);
  return <div className="min-h-screen bg-met-background text-slate-900"><Nav /><main className="mx-auto w-full max-w-6xl px-4 py-8"><header className="mb-6"><h1 className="text-3xl font-bold tracking-tight text-met-primary">{title}</h1>{subtitle ? <p className="mt-2 max-w-3xl text-sm text-slate-700">{subtitle}</p> : null}</header>{children}</main><StickyWhatsApp /></div>;
}

function quickCalc(p: Product, mode: Mode, input: string) {
  const ppp = Math.max(1, Math.ceil(n(p.piecesPerPallet, 1)));
  let bricks = 0;
  let pallets = 0;
  if (mode === "M2") bricks = Math.ceil(Math.max(0, n(input)) * BRICKS_PER_M2);
  if (mode === "PIECES") bricks = Math.max(0, Math.ceil(n(input)));
  if (mode === "PALLETS") pallets = Math.max(0, Math.ceil(n(input)));
  if (!pallets) pallets = Math.ceil(bricks / ppp);
  if (!bricks) bricks = pallets * ppp;
  const hasPrice = n(p.priceCfa) > 0;
  const cost = hasPrice ? (p.unit === "PALLET" ? pallets * n(p.priceCfa) : bricks * n(p.priceCfa)) : null;
  return { bricks, pallets, hasPrice, cost };
}

export function MetHomePage() {
  const { data } = useQuery<{ settings?: Record<string, unknown> }>({ queryKey: ["met", "settings", "public"], queryFn: () => apiRequest("/api/met/settings/public", { method: "GET" }), staleTime: 60_000 });
  const hero = (data?.settings?.["homepage.hero"] as HeroSettings | undefined) || {};
  return <Shell title={hero.title || "Construisez en terre, durablement"} subtitle={hero.subtitle || "Briques BTC/CEB, maison modele et devis chantier."} pageTitle="Maison en Terre — Construisez en terre, durablement" description="Maison en Terre: briques BTC/CEB, maison modele et devis." path="/"><section className="relative overflow-hidden rounded-2xl border border-[#D8C7AB] bg-slate-900 p-6 text-white" style={{ backgroundImage: "linear-gradient(130deg, rgba(15,23,42,.75), rgba(122,62,18,.78)), url('/assets/bdo-gateway-bg.jpg')", backgroundSize: "cover", backgroundPosition: "center" }}><h2 className="text-3xl font-bold">Maison modele, briques BTC/CEB et livraison chantier</h2><p className="mt-3 max-w-3xl text-sm text-slate-100/90">Construction en terre, de la commande de briques jusqu au suivi de gros oeuvre.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><a href="/briques" className="rounded-xl bg-met-primary px-4 py-3 text-center text-sm font-semibold text-white">{hero.ctaPrimary || "Commander des briques"}</a><a href="/devis" className="rounded-xl bg-met-secondary px-4 py-3 text-center text-sm font-semibold text-white">{hero.ctaSecondary || "Obtenir un devis"}</a><a href="/maison-modele" className="rounded-xl border border-white/50 px-4 py-3 text-center text-sm font-semibold text-white">{hero.ctaThird || "Visiter la maison modele"}</a></div></section><section className="mt-5 grid gap-3 rounded-xl border border-[#D8C7AB] bg-white p-4 sm:grid-cols-3"><div className="rounded-lg border border-[#E8DCC2] bg-[#FCF8EE] p-3 text-sm">Unite BTC/CEB operationnelle</div><div className="rounded-lg border border-[#E8DCC2] bg-[#FCF8EE] p-3 text-sm">Maison modele visitable</div><div className="rounded-lg border border-[#E8DCC2] bg-[#FCF8EE] p-3 text-sm">Livraison selon zone</div></section></Shell>;
}

export function MetModelHousePage() {
  return <Shell title="Maison modele" subtitle="Visitez la maison modele avant votre chantier." pageTitle="Maison modele — Maison en Terre" description="Visite de la maison modele Maison en Terre." path="/maison-modele"><section className="grid gap-4 md:grid-cols-3">{["Facade", "Salon", "Chambre", "Cuisine", "Toiture", "Details"].map((label) => <figure key={label} className="overflow-hidden rounded-xl border border-[#D8C7AB] bg-white"><img src="/assets/bdo-gateway-bg.jpg" alt={label} className="h-40 w-full object-cover" /><figcaption className="px-3 py-2 text-xs text-slate-700">{label}</figcaption></figure>)}</section></Shell>;
}

export function MetBricksPage() {
  const params = useMemo(() => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)), []);
  const { data } = useQuery<{ items?: Product[] }>({ queryKey: ["met", "public", "products"], queryFn: () => apiRequest("/api/met/public/products?active=true", { method: "GET" }), staleTime: 60_000 });
  const products = (data?.items || []).filter((x) => x.isActive !== false);
  const [mode, setMode] = useState<Mode>("M2");
  const [input, setInput] = useState("");
  const [pick, setPick] = useState("");
  const [qty, setQty] = useState<Record<string, { pieces: string; pallets: string }>>({});
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", city: "", deliveryAddress: "", requestedDeliveryDate: "", notes: "" });
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ orderId: string; totalCfa: number } | null>(null);
  useEffect(() => { if (!pick && products.length) setPick(products[0].id); }, [products, pick]);
  useEffect(() => { const s = t(params.get("surface")); if (n(s) > 0) { setMode("M2"); setInput(s); } }, [params]);
  const sel = products.find((p) => p.id === pick) || products[0];
  const s = sel ? quickCalc(sel, mode, input) : { bricks: 0, pallets: 0, hasPrice: false, cost: null as number | null };
  const lines = products.map((p) => { const pieces = Math.max(0, Math.trunc(n(qty[p.id]?.pieces))); const pallets = Math.max(0, Math.trunc(n(qty[p.id]?.pallets))); if (!pieces && !pallets) return null; return { productId: p.id, quantityPieces: pieces || undefined, quantityPallets: pallets || undefined }; }).filter(Boolean) as Array<{ productId: string; quantityPieces?: number; quantityPallets?: number }>;
  const total = lines.reduce((sum, line) => { const p = products.find((x) => x.id === line.productId); if (!p) return sum; const billable = p.unit === "PALLET" ? (line.quantityPallets || 0) : ((line.quantityPieces || 0) || (line.quantityPallets || 0) * Math.max(1, p.piecesPerPallet)); return sum + Math.max(0, n(p.priceCfa) * billable); }, 0);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!lines.length) { setError("Ajoutez au moins une quantite."); return; }
    setStatus("saving");
    try {
      const res = await apiRequest("/api/orders", "POST", { lead: { name: customer.name, phone: customer.phone, email: t(customer.email) || undefined, city: customer.city, intent: "BUY_BRICKS", message: t(customer.notes) || undefined }, city: customer.city, deliveryAddress: customer.deliveryAddress, requestedDeliveryDate: t(customer.requestedDeliveryDate) || undefined, notes: t(customer.notes) || undefined, items: lines });
      setOrder({ orderId: t(res?.orderId), totalCfa: n(res?.totalCfa, total) });
      setStatus("done");
      setQty({});
      setCustomer({ name: "", phone: "", email: "", city: "", deliveryAddress: "", requestedDeliveryDate: "", notes: "" });
    } catch (err: any) { setStatus("error"); setError(String(err?.message || "Echec commande")); }
  }
  return <Shell title="Briques BTC/CEB" subtitle="Calculateur + checkout commande chantier." pageTitle="Briques BTC/CEB — Maison en Terre" description="Catalogue briques BTC/CEB Maison en Terre." path="/briques"><section className="rounded-xl border border-[#D8C7AB] bg-white p-4"><div className="grid gap-3 md:grid-cols-3"><select value={sel?.id || ""} onChange={(e) => setPick(e.target.value)} className="rounded border border-[#D8C7AB] px-3 py-2 text-sm">{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><div className="grid grid-cols-3 rounded border border-[#D8C7AB] p-1 text-xs">{(["M2", "PIECES", "PALLETS"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`rounded px-2 py-1.5 ${mode === m ? "bg-met-primary text-white" : "text-slate-600"}`}>{m === "M2" ? "m2" : m === "PIECES" ? "nb briques" : "palettes"}</button>)}</div><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Valeur" /></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded border border-[#E8DCC2] bg-[#FCF8EE] p-2 text-sm">Briques: {s.bricks}</div><div className="rounded border border-[#E8DCC2] bg-[#FCF8EE] p-2 text-sm">Palettes: {s.pallets}</div><div className="rounded border border-[#E8DCC2] bg-[#FCF8EE] p-2 text-sm">Cout: {s.hasPrice ? cfa(s.cost) : "Sur devis"}</div></div></section><section className="mt-5 grid gap-4 lg:grid-cols-2"><div className="space-y-3">{products.map((p) => <article key={p.id} className="rounded-xl border border-[#D8C7AB] bg-white p-4"><p className="font-semibold text-met-primary">{p.name}</p><p className="text-xs text-slate-500">SKU: {p.sku}</p><p className="mt-2 text-sm text-slate-700">{p.description || "Brique BTC/CEB"}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input placeholder="Pieces" className="rounded border border-[#D8C7AB] px-2 py-1.5 text-sm" value={qty[p.id]?.pieces || ""} onChange={(e) => setQty((q) => ({ ...q, [p.id]: { pieces: e.target.value, pallets: q[p.id]?.pallets || "" } }))} /><input placeholder="Palettes" className="rounded border border-[#D8C7AB] px-2 py-1.5 text-sm" value={qty[p.id]?.pallets || ""} onChange={(e) => setQty((q) => ({ ...q, [p.id]: { pieces: q[p.id]?.pieces || "", pallets: e.target.value } }))} /></div></article>)}</div><form onSubmit={submit} className="rounded-xl border border-[#D8C7AB] bg-white p-4"><h2 className="text-lg font-semibold text-met-primary">Checkout</h2><div className="mt-3 grid gap-3"><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Nom" value={customer.name} onChange={(e) => setCustomer((p) => ({ ...p, name: e.target.value }))} /><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Telephone" value={customer.phone} onChange={(e) => setCustomer((p) => ({ ...p, phone: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Email (optionnel)" value={customer.email} onChange={(e) => setCustomer((p) => ({ ...p, email: e.target.value }))} /><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Ville" value={customer.city} onChange={(e) => setCustomer((p) => ({ ...p, city: e.target.value }))} /><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Adresse livraison" value={customer.deliveryAddress} onChange={(e) => setCustomer((p) => ({ ...p, deliveryAddress: e.target.value }))} /><input type="date" className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" value={customer.requestedDeliveryDate} onChange={(e) => setCustomer((p) => ({ ...p, requestedDeliveryDate: e.target.value }))} /><textarea className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" rows={3} placeholder="Notes" value={customer.notes} onChange={(e) => setCustomer((p) => ({ ...p, notes: e.target.value }))} /></div><p className="mt-3 rounded border border-[#E8DCC2] bg-[#FCF8EE] p-2 text-sm">Total estime: {cfa(total)}</p>{error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}{status === "done" && order ? <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">Commande {order.orderId} • {cfa(order.totalCfa)} <a className="underline" href={wa(`Bonjour Maison en Terre,\nJe confirme ma commande ${order.orderId}.\nTotal estime: ${cfa(order.totalCfa)}.`)} target="_blank" rel="noreferrer">Envoyer sur WhatsApp</a></div> : null}<button disabled={status === "saving"} className="mt-3 w-full rounded bg-met-primary px-4 py-2 text-sm font-semibold text-white">{status === "saving" ? "Envoi..." : "Commander"}</button></form></section></Shell>;
}

export function MetEstimatePage() {
  const params = useMemo(() => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)), []);
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", landSizeM2: "", rooms: "", budgetCfa: "", timeline: "", brief: "" });
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  useEffect(() => { const plan = t(params.get("plan")); if (plan) setForm((p) => ({ ...p, brief: p.brief || `Projet base sur le plan: ${plan}` })); }, [params]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!file) { setError("Ajoutez un plan PDF/image."); return; }
    if (!ALLOWED_UPLOAD_MIME.has(file.type.toLowerCase())) { setError("Formats autorises: PDF/JPG/PNG/WEBP."); return; }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) { setError("Fichier max 15 MB."); return; }
    setStatus("saving");
    try {
      const fd = new FormData();
      fd.append("name", form.name); fd.append("phone", form.phone); fd.append("email", form.email); fd.append("city", form.city); fd.append("projectCity", form.city);
      if (t(form.landSizeM2)) fd.append("landSizeM2", form.landSizeM2);
      if (t(form.rooms)) fd.append("rooms", form.rooms);
      if (t(form.budgetCfa)) fd.append("budgetCfa", form.budgetCfa);
      if (t(form.timeline)) fd.append("timeline", form.timeline);
      if (t(form.brief)) fd.append("brief", form.brief);
      fd.append("planFile", file);
      const res = await apiRequest("/api/estimate-requests", { method: "POST", body: fd });
      setRequestId(t(res?.estimateRequestId));
      setStatus("done");
      setForm({ name: "", phone: "", email: "", city: "", landSizeM2: "", rooms: "", budgetCfa: "", timeline: "", brief: "" });
      setFile(null);
    } catch (err: any) { setStatus("error"); setError(String(err?.message || "Echec envoi devis")); }
  }

  return <Shell title="Obtenir un devis" subtitle="Upload plan PDF/image + infos projet." pageTitle="Obtenir un devis — Maison en Terre" description="Demande de devis Maison en Terre." path="/devis"><form onSubmit={submit} className="max-w-4xl rounded-xl border border-[#D8C7AB] bg-white p-4"><div className="grid gap-3 sm:grid-cols-2"><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Nom" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Telephone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Email (optionnel)" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Ville du projet" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Surface terrain (m2)" value={form.landSizeM2} onChange={(e) => setForm((p) => ({ ...p, landSizeM2: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Nombre de pieces" value={form.rooms} onChange={(e) => setForm((p) => ({ ...p, rooms: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Budget (FCFA)" value={form.budgetCfa} onChange={(e) => setForm((p) => ({ ...p, budgetCfa: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Delai souhaite" value={form.timeline} onChange={(e) => setForm((p) => ({ ...p, timeline: e.target.value }))} /></div><textarea className="mt-3 w-full rounded border border-[#D8C7AB] px-3 py-2 text-sm" rows={4} placeholder="Brief projet" value={form.brief} onChange={(e) => setForm((p) => ({ ...p, brief: e.target.value }))} /><div className="mt-3 rounded border border-[#E8DCC2] bg-[#FCF8EE] p-3"><input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} /><p className="mt-1 text-xs text-slate-600">{file ? file.name : "Aucun fichier selectionne"}</p></div>{error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}{status === "done" && requestId ? <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">Demande enregistree: {requestId}. <a className="underline" href={wa(`Bonjour Maison en Terre,\nJe confirme ma demande de devis ${requestId}.`)} target="_blank" rel="noreferrer">Envoyer sur WhatsApp</a></div> : null}<button disabled={status === "saving"} className="mt-3 rounded bg-met-primary px-4 py-2 text-sm font-semibold text-white">{status === "saving" ? "Envoi..." : "Soumettre la demande"}</button></form></Shell>;
}

export function MetPlansPage() {
  const [f, setF] = useState({ q: "", minArea: "", maxArea: "", bedrooms: "", floors: "", tag: "" });
  const qs = useMemo(() => { const p = new URLSearchParams({ active: "true" }); if (t(f.q)) p.set("q", t(f.q)); if (t(f.minArea)) p.set("minArea", t(f.minArea)); if (t(f.maxArea)) p.set("maxArea", t(f.maxArea)); if (t(f.bedrooms)) p.set("bedrooms", t(f.bedrooms)); if (t(f.floors)) p.set("floors", t(f.floors)); if (t(f.tag)) p.set("tag", t(f.tag)); return p.toString(); }, [f]);
  const { data } = useQuery<{ items?: Plan[] }>({ queryKey: ["met", "public", "plans", qs], queryFn: () => apiRequest(`/api/met/public/plans?${qs}`, { method: "GET" }), staleTime: 30_000 });
  const plans = data?.items || [];
  const tags = Array.from(new Set(plans.flatMap((p) => (Array.isArray(p.tags) ? p.tags : [])))).sort((a, b) => String(a).localeCompare(String(b)));
  return <Shell title="Catalogue de plans" subtitle="Filtres surface/chambres/etages/tags + pages detail." pageTitle="Catalogue de plans — Maison en Terre" description="Catalogue de plans Maison en Terre." path="/plans"><section className="rounded-xl border border-[#D8C7AB] bg-white p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Recherche" value={f.q} onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Surface min" value={f.minArea} onChange={(e) => setF((x) => ({ ...x, minArea: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Surface max" value={f.maxArea} onChange={(e) => setF((x) => ({ ...x, maxArea: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Chambres" value={f.bedrooms} onChange={(e) => setF((x) => ({ ...x, bedrooms: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Etages" value={f.floors} onChange={(e) => setF((x) => ({ ...x, floors: e.target.value }))} /><select className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" value={f.tag} onChange={(e) => setF((x) => ({ ...x, tag: e.target.value }))}><option value="">Tous les tags</option>{tags.map((tag) => <option key={String(tag)} value={String(tag)}>{String(tag)}</option>)}</select></div></section><section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.length ? plans.map((p) => <article key={p.id} className="overflow-hidden rounded-xl border border-[#D8C7AB] bg-white"><img src={img(p.thumbnailUrl) || "/assets/bdo-gateway-bg.jpg"} alt={p.title} className="h-40 w-full object-cover" /><div className="p-4"><h3 className="text-lg font-semibold text-met-primary">{p.title}</h3><p className="mt-2 text-sm text-slate-700">{p.description || "Plan maison en terre."}</p><p className="mt-2 text-xs text-slate-600">{p.bedrooms ?? "-"} ch. • {p.floors ?? "-"} etage(s) • {t(p.areaM2) || "-"} m2</p><div className="mt-3 grid gap-2"><a className="rounded bg-met-primary px-3 py-2 text-center text-xs font-semibold text-white" href={`/plans/${encodeURIComponent(t(p.slug || p.id))}`}>Voir le plan</a><a className="rounded border border-met-primary/40 px-3 py-2 text-center text-xs font-semibold text-met-primary" href={`/briques?surface=${encodeURIComponent(t(p.areaM2))}&plan=${encodeURIComponent(p.title)}`}>Commander briques</a><a className="rounded border border-met-secondary/40 px-3 py-2 text-center text-xs font-semibold text-met-secondary" href={`/devis?plan=${encodeURIComponent(p.title)}`}>Demander devis</a></div></div></article>) : <div className="rounded-xl border border-[#D8C7AB] bg-white p-4 text-sm text-slate-700">Aucun plan trouve.</div>}</section></Shell>;
}

export function MetPlanDetailPage({ slug }: { slug: string }) {
  const id = t(slug);
  const { data } = useQuery<{ item?: Plan }>({ queryKey: ["met", "public", "plan", id], queryFn: () => apiRequest(`/api/met/public/plans/${encodeURIComponent(id)}`, { method: "GET" }), enabled: Boolean(id), staleTime: 30_000 });
  const p = data?.item;
  return <Shell title={p?.title || "Detail plan"} subtitle="Detail du plan + CTA briques/devis." pageTitle={`${p?.title || "Detail plan"} — Maison en Terre`} description="Detail d un plan Maison en Terre." path={`/plans/${encodeURIComponent(id)}`}>{!p ? <div className="rounded-xl border border-[#D8C7AB] bg-white p-4 text-sm text-slate-700">Plan introuvable.</div> : <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]"><article className="rounded-xl border border-[#D8C7AB] bg-white p-4"><img src={img(p.thumbnailUrl) || "/assets/bdo-gateway-bg.jpg"} alt={p.title} className="h-64 w-full rounded-lg object-cover" /><p className="mt-4 text-sm text-slate-700">{p.description || "Description en cours."}</p><p className="mt-2 text-sm text-slate-700">{p.bedrooms ?? "-"} ch. • {p.bathrooms ?? "-"} sdb • {p.floors ?? "-"} etage(s) • {t(p.areaM2) || "-"} m2</p></article><aside className="space-y-3"><a className="block rounded bg-met-primary px-3 py-2 text-center text-sm font-semibold text-white" href={`/briques?surface=${encodeURIComponent(t(p.areaM2))}&plan=${encodeURIComponent(p.title)}`}>Commander briques pour ce plan</a><a className="block rounded bg-met-secondary px-3 py-2 text-center text-sm font-semibold text-white" href={`/devis?plan=${encodeURIComponent(p.title)}`}>Demander devis construction</a>{p.fileUrl ? <a className="block rounded border border-met-primary/40 px-3 py-2 text-center text-sm font-semibold text-met-primary" href={img(p.fileUrl)} target="_blank" rel="noreferrer">Telecharger le PDF</a> : null}</aside></section>}</Shell>;
}

export function MetRealisationsPage() {
  const { data } = useQuery<{ items?: Project[] }>({ queryKey: ["met", "public", "projects"], queryFn: () => apiRequest("/api/met/public/projects", { method: "GET" }), staleTime: 30_000 });
  const projects = data?.items || [];
  return <Shell title="Realisations" subtitle="Projets Maison en Terre, galerie et contexte chantier." pageTitle="Realisations — Maison en Terre" description="Realisations Maison en Terre." path="/realisations"><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.length ? projects.map((p) => <article key={p.id} className="overflow-hidden rounded-xl border border-[#D8C7AB] bg-white"><img src={img(p.media?.[0]?.assetUrl) || "/assets/bdo-gateway-bg.jpg"} alt={p.title} className="h-40 w-full object-cover" /><div className="p-4"><h2 className="text-lg font-semibold text-met-primary">{p.title}</h2><p className="mt-2 text-sm text-slate-700">{p.summary || "Projet Maison en Terre."}</p><a className="mt-3 inline-block rounded bg-met-primary px-3 py-2 text-xs font-semibold text-white" href={`/realisations/${encodeURIComponent(t(p.slug || p.id))}`}>Voir le projet</a></div></article>) : <div className="rounded-xl border border-[#D8C7AB] bg-white p-4 text-sm text-slate-700">Aucune realisation publiee.</div>}</section></Shell>;
}

export function MetProjectDetailPage({ slug }: { slug: string }) {
  const id = t(slug);
  const { data } = useQuery<{ item?: Project }>({ queryKey: ["met", "public", "project", id], queryFn: () => apiRequest(`/api/met/public/projects/${encodeURIComponent(id)}`, { method: "GET" }), enabled: Boolean(id), staleTime: 30_000 });
  const p = data?.item;
  return <Shell title={p?.title || "Detail realisation"} subtitle="Detail du projet, galerie et informations chantier." pageTitle={`${p?.title || "Detail realisation"} — Maison en Terre`} description="Detail realisation Maison en Terre." path={`/realisations/${encodeURIComponent(id)}`}>{!p ? <div className="rounded-xl border border-[#D8C7AB] bg-white p-4 text-sm text-slate-700">Projet introuvable.</div> : <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]"><article className="rounded-xl border border-[#D8C7AB] bg-white p-4"><p className="text-xs uppercase tracking-wide text-met-primary">{p.location || "Localisation"}</p><p className="mt-3 text-sm text-slate-700">{p.description || p.summary || "Description en cours."}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{(p.media || []).length ? p.media.map((m) => <figure key={m.id} className="overflow-hidden rounded-lg border border-[#E8DCC2]"><img src={img(m.assetUrl) || "/assets/bdo-gateway-bg.jpg"} alt={m.caption || p.title} className="h-36 w-full object-cover" /><figcaption className="px-2 py-1 text-xs text-slate-600">{m.caption || "Galerie chantier"}</figcaption></figure>) : <figure className="overflow-hidden rounded-lg border border-[#E8DCC2]"><img src="/assets/bdo-gateway-bg.jpg" alt={p.title} className="h-36 w-full object-cover" /><figcaption className="px-2 py-1 text-xs text-slate-600">Galerie a venir</figcaption></figure>}</div></article><aside className="space-y-2"><a className="block rounded bg-met-secondary px-3 py-2 text-center text-sm font-semibold text-white" href="/devis">Demander un devis</a><a className="block rounded border border-met-primary/40 px-3 py-2 text-center text-sm font-semibold text-met-primary" href="/briques">Commander des briques</a></aside></section>}</Shell>;
}

export function MetBlogPage() {
  const { data } = useQuery<{ items?: BlogPost[] }>({ queryKey: ["met", "public", "blog"], queryFn: () => apiRequest("/api/met/public/blog-posts", { method: "GET" }), staleTime: 30_000 });
  const posts = data?.items || [];
  return <Shell title="Blog" subtitle="Guides construction en terre, briques BTC/CEB et planification chantier." pageTitle="Blog — Maison en Terre" description="Blog Maison en Terre." path="/blog"><section className="space-y-4">{posts.length ? posts.map((p) => <article key={p.id} className="rounded-xl border border-[#D8C7AB] bg-white p-4"><h2 className="text-lg font-semibold text-met-primary">{p.title}</h2><p className="mt-2 text-sm text-slate-700">{p.excerpt || "Article disponible."}</p><p className="mt-1 text-xs text-slate-500">Publie le {dte(p.publishedAt)}</p><a className="mt-3 inline-block rounded bg-met-primary px-3 py-2 text-xs font-semibold text-white" href={`/blog/${encodeURIComponent(t(p.slug || p.id))}`}>Lire l article</a></article>) : <div className="rounded-xl border border-[#D8C7AB] bg-white p-4 text-sm text-slate-700">Les premiers articles arrivent bientot.</div>}</section></Shell>;
}

export function MetBlogPostPage({ slug }: { slug: string }) {
  const id = t(slug);
  const { data } = useQuery<{ item?: BlogPost }>({ queryKey: ["met", "public", "blog-post", id], queryFn: () => apiRequest(`/api/met/public/blog-posts/${encodeURIComponent(id)}`, { method: "GET" }), enabled: Boolean(id), staleTime: 30_000 });
  const p = data?.item;
  return <Shell title={p?.title || "Article"} subtitle={p?.excerpt || "Article Maison en Terre."} pageTitle={`${p?.title || "Article"} — Maison en Terre`} description={p?.excerpt || "Article Maison en Terre."} path={`/blog/${encodeURIComponent(id)}`}>{!p ? <div className="rounded-xl border border-[#D8C7AB] bg-white p-4 text-sm text-slate-700">Article introuvable.</div> : <article className="rounded-xl border border-[#D8C7AB] bg-white p-4">{p.coverImageUrl ? <img src={img(p.coverImageUrl)} alt={p.title} className="mb-4 h-56 w-full rounded-lg object-cover" /> : null}<p className="mb-4 text-xs text-slate-500">Publie le {dte(p.publishedAt)}</p><div className="space-y-3">{md(p.contentMarkdown || p.excerpt || "Contenu en cours de publication.")}</div></article>}</Shell>;
}

export function MetContactPage() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await apiRequest("/api/leads", "POST", { name: form.name, phone: form.phone, email: t(form.email) || undefined, city: form.city, source: "WEB_FORM", intent: "INFO", message: form.message });
      setStatus("done");
      setForm({ name: "", phone: "", email: "", city: "", message: "" });
    } catch (err: any) { setStatus("error"); setError(String(err?.message || "Echec envoi message")); }
  }
  return <Shell title="Contact" subtitle="WhatsApp, appel et formulaire de contact." pageTitle="Contact — Maison en Terre" description="Contact Maison en Terre." path="/contact"><section className="grid gap-4 md:grid-cols-2"><article className="rounded-xl border border-[#D8C7AB] bg-white p-4 text-sm text-slate-700"><h2 className="text-lg font-semibold text-met-primary">Coordonnees</h2><p className="mt-2"><strong>WhatsApp:</strong> +{MET_WHATSAPP}</p><p><strong>Telephone:</strong> <a className="underline" href={`tel:+${MET_WHATSAPP}`}>+{MET_WHATSAPP}</a></p><p><strong>Email:</strong> contact@maisonsenterre.com</p><div className="mt-4 flex flex-wrap gap-2"><a className="rounded bg-met-secondary px-3 py-2 text-xs font-semibold text-white" href={wa("Bonjour Maison en Terre, je souhaite des informations sur mon projet.")} target="_blank" rel="noreferrer">Ecrire sur WhatsApp</a><a className="rounded border border-met-primary/40 px-3 py-2 text-xs font-semibold text-met-primary" href={`tel:+${MET_WHATSAPP}`}>Appeler</a></div><div className="mt-4 overflow-hidden rounded-lg border border-[#E8DCC2]"><iframe title="Localisation Maison en Terre" src="https://www.openstreetmap.org/export/embed.html?bbox=2.37%2C6.35%2C2.47%2C6.41&layer=mapnik&marker=6.38%2C2.42" className="h-48 w-full" loading="lazy" /></div></article><form onSubmit={submit} className="rounded-xl border border-[#D8C7AB] bg-white p-4"><h2 className="text-lg font-semibold text-met-primary">Formulaire contact</h2><div className="mt-3 grid gap-3"><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Nom" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Telephone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /><input className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Email (optionnel)" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /><input required className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Ville" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /><textarea required rows={4} className="rounded border border-[#D8C7AB] px-3 py-2 text-sm" placeholder="Votre message" value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} /></div>{error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}{status === "done" ? <p className="mt-2 text-xs text-emerald-700">Message envoye avec succes.</p> : null}<button disabled={status === "sending"} className="mt-3 rounded bg-met-primary px-4 py-2 text-sm font-semibold text-white">{status === "sending" ? "Envoi..." : "Envoyer"}</button></form></section></Shell>;
}

export function MetLegalMentionsPage() {
  return <Shell title="Mentions legales" subtitle="Informations de publication Maison en Terre." pageTitle="Mentions legales — Maison en Terre" description="Mentions legales Maison en Terre." path="/mentions-legales"><article className="rounded-xl border border-[#D8C7AB] bg-white p-4 text-sm text-slate-700"><p>Editeur: Maison en Terre</p><p>Contact: contact@maisonsenterre.com</p><p>Hebergement: infrastructure Exportunity</p></article></Shell>;
}

export function MetPrivacyPolicyPage() {
  return <Shell title="Politique de confidentialite" subtitle="Traitement des donnees collectees via formulaires et WhatsApp." pageTitle="Politique de confidentialite — Maison en Terre" description="Politique de confidentialite Maison en Terre." path="/politique-confidentialite"><article className="rounded-xl border border-[#D8C7AB] bg-white p-4 text-sm text-slate-700"><p>Nous collectons uniquement les donnees necessaires au traitement des devis, commandes et demandes d information.</p><p className="mt-2">Vous pouvez demander la mise a jour ou suppression de vos donnees via contact@maisonsenterre.com.</p></article></Shell>;
}

