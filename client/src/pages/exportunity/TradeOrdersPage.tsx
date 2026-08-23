import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  FileText,
  Globe2,
  MessageSquareText,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
  TriangleAlert,
} from "lucide-react";
import { Link, Redirect, useLocation, useRoute } from "wouter";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type OrderSummary = {
  id: number;
  orderNumber: string;
  status: string | null;
  total: string;
  fulfillmentType: string | null;
  createdAt: string;
  updatedAt: string;
  itemsCount: number;
  seller: { id: number; name: string } | null;
};

type OrderItem = {
  id: number;
  productName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
};

type OrderDetail = Omit<OrderSummary, "itemsCount"> & {
  subtotal: string;
  deliveryFee: string | null;
  serviceFee: string | null;
  discount: string | null;
  deliveryAddress: string | null;
  confirmedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
};

type OrdersResponse = {
  ok: true;
  currency: string;
  orders: OrderSummary[];
};

type OrderDetailResponse = {
  ok: true;
  currency: string;
  order: OrderDetail;
  items: OrderItem[];
  actions: {
    paymentAvailable: false;
    externalSideEffect: false;
    message: string;
  };
};

type StatusGroup = "open" | "active" | "complete" | "attention";
type StatusFilter = "all" | StatusGroup;

function copyFor(language: string) {
  if (language === "fr") {
    return {
      network: "Réseau commercial mondial",
      backNetwork: "Retour au réseau",
      eyebrow: "Dossiers commerciaux",
      title: "Vos commandes, dans le même parcours GTN.",
      description:
        "Un espace clair pour consulter les commandes liées à votre compte Exportunity, dans le langage visuel et les limites opérationnelles du GTN.",
      all: "Toutes",
      open: "Ouvertes",
      active: "En cours",
      complete: "Terminées",
      attention: "À vérifier",
      records: "Dossiers",
      refresh: "Actualiser",
      refreshing: "Actualisation…",
      order: "Commande",
      items: "articles",
      supplier: "Fournisseur",
      created: "Créée",
      view: "Ouvrir le dossier",
      loading: "Chargement des dossiers…",
      loadFailed: "Impossible de charger les commandes de ce compte.",
      retry: "Réessayer",
      empty: "Aucune commande dans cette vue",
      emptyBody: "Aucune donnée n’a été inventée. Commencez par qualifier un besoin avec Awa ou explorez le réseau industriel.",
      talkAwa: "Parler à Awa",
      explore: "Explorer le réseau industriel",
      readOnly: "Consultation seulement",
      readOnlyBody:
        "Cette page ne déclenche ni paiement, ni achat fournisseur, ni livraison. Chaque action commerciale reste séparée et gouvernée.",
      backOrders: "Retour aux commandes",
      orderRecord: "Dossier de commande",
      amount: "Montant enregistré",
      fulfilment: "Mode de remise",
      delivery: "Livraison",
      pickup: "Retrait",
      updated: "Dernière mise à jour",
      recordTrail: "Progression enregistrée",
      recorded: "Commande enregistrée",
      confirmed: "Confirmation",
      preparing: "Préparation",
      delivered: "Remise terminée",
      lines: "Articles enregistrés",
      quantity: "Quantité",
      unitPrice: "Prix unitaire",
      subtotal: "Sous-total",
      deliveryFee: "Livraison",
      serviceFee: "Service",
      discount: "Remise",
      total: "Total",
      destination: "Destination enregistrée",
      noDestination: "Aucune adresse de livraison enregistrée.",
      nextTitle: "Besoin d’agir sur ce dossier ?",
      nextBody:
        "Revenez vers Awa pour qualifier le suivi. Un paiement ou un contact fournisseur n’apparaît que dans un parcours autorisé séparé.",
      detailFailed: "Ce dossier est introuvable ou n’appartient pas à ce compte.",
      pending: "En attente",
      confirmedStatus: "Confirmée",
      ready: "Prête",
      deliveredStatus: "Livrée",
      cancelled: "Annulée",
      processing: "En cours",
    };
  }

  return {
    network: "Global Trade Network",
    backNetwork: "Back to the network",
    eyebrow: "Commercial records",
    title: "Your orders, in the same GTN journey.",
    description:
      "A clear place to review orders linked to your Exportunity account, within the GTN visual language and governed operating boundaries.",
    all: "All",
    open: "Open",
    active: "In progress",
    complete: "Completed",
    attention: "Review",
    records: "Records",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    order: "Order",
    items: "items",
    supplier: "Supplier",
    created: "Created",
    view: "Open record",
    loading: "Loading order records…",
    loadFailed: "The orders for this account could not be loaded.",
    retry: "Try again",
    empty: "No orders in this view",
    emptyBody: "No data has been invented. Start by qualifying a requirement with Awa or explore the industrial network.",
    talkAwa: "Talk to Awa",
    explore: "Explore the industrial network",
    readOnly: "Read-only record",
    readOnlyBody:
      "This page triggers no payment, supplier purchase, or delivery. Every commercial action remains separate and governed.",
    backOrders: "Back to orders",
    orderRecord: "Order record",
    amount: "Recorded amount",
    fulfilment: "Fulfilment mode",
    delivery: "Delivery",
    pickup: "Pickup",
    updated: "Last updated",
    recordTrail: "Recorded progress",
    recorded: "Order recorded",
    confirmed: "Confirmation",
    preparing: "Preparation",
    delivered: "Delivery complete",
    lines: "Recorded items",
    quantity: "Quantity",
    unitPrice: "Unit price",
    subtotal: "Subtotal",
    deliveryFee: "Delivery",
    serviceFee: "Service",
    discount: "Discount",
    total: "Total",
    destination: "Recorded destination",
    noDestination: "No delivery address is recorded.",
    nextTitle: "Need to act on this record?",
    nextBody:
      "Return to Awa to qualify the follow-up. A payment or supplier-contact action appears only in a separate authorized workflow.",
    detailFailed: "This record was not found or does not belong to this account.",
    pending: "Pending",
    confirmedStatus: "Confirmed",
    ready: "Ready",
    deliveredStatus: "Delivered",
    cancelled: "Cancelled",
    processing: "In progress",
  };
}

function statusGroup(statusValue: unknown): StatusGroup {
  const status = String(statusValue || "pending").trim().toLowerCase();
  if (status.includes("cancel") || status.includes("disput") || status.includes("fail")) return "attention";
  if (status.includes("deliver") || status.includes("complete") || status.includes("done")) return "complete";
  if (status.includes("confirm") || status.includes("ready") || status.includes("process") || status.includes("paid")) return "active";
  return "open";
}

function statusPresentation(statusValue: unknown, copy: ReturnType<typeof copyFor>) {
  const status = String(statusValue || "pending").trim().toLowerCase();
  const group = statusGroup(status);
  const label = status.includes("cancel")
    ? copy.cancelled
    : status.includes("deliver") || status.includes("complete")
      ? copy.deliveredStatus
      : status.includes("ready")
        ? copy.ready
        : status.includes("confirm") || status.includes("paid")
          ? copy.confirmedStatus
          : status.includes("process")
            ? copy.processing
            : copy.pending;
  const className =
    group === "complete"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : group === "active"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : group === "attention"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-amber-200 bg-amber-50 text-amber-800";
  return { group, label, className };
}

function formatExactMoney(value: string | null | undefined, currency: string, language: string) {
  const raw = String(value ?? "0").trim();
  const match = raw.match(/^(-?)(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) return `${raw || "0"} ${currency}`;
  const sign = match[1] ? "-" : "";
  const whole = BigInt(match[2]);
  const fraction = String(match[3] || "").replace(/0+$/, "");
  const locale = language === "fr" ? "fr-FR" : "en-GB";
  const formattedWhole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  const decimalSeparator = language === "fr" ? "," : ".";
  return `${sign}${formattedWhole}${fraction ? `${decimalSeparator}${fraction}` : ""} ${currency}`;
}

function formatDate(value: string | null | undefined, language: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function progressIndex(statusValue: unknown) {
  const status = String(statusValue || "pending").trim().toLowerCase();
  if (status.includes("deliver") || status.includes("complete")) return 3;
  if (status.includes("ready") || status.includes("process")) return 2;
  if (status.includes("confirm") || status.includes("paid")) return 1;
  return 0;
}

function PageShell({ children }: { children: ReactNode }) {
  const { language } = useLocale();
  const copy = copyFor(language);
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F7F8FA] text-[#07111F]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="pointer-events-none absolute -left-32 top-24 h-96 w-96 rounded-full bg-[#F5A623]/12 blur-3xl" />
      <header className="relative z-20 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3">
            <img
              src="/tenants/exportunity/official/logo-long-light.png"
              alt="Exportunity"
              className="h-9 w-auto max-w-[190px] object-contain"
            />
            <span className="hidden border-l border-slate-200 pl-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">
              {copy.network}
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/trade" className="hidden px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-950 md:block">
              Trade intelligence
            </Link>
            <Link href="/industrial" className="hidden px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-950 md:block">
              Industrial network
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[#F5A623] hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
              {copy.backNetwork}
            </Link>
          </nav>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">{children}</main>
    </div>
  );
}

export default function TradeOrdersPage() {
  const session = useSession();
  const { language } = useLocale();
  const copy = copyFor(language);
  const [location, navigate] = useLocation();
  const [, routeParams] = useRoute("/orders/:orderNumber");
  const orderNumber = routeParams?.orderNumber ? String(routeParams.orderNumber) : null;
  const [filter, setFilter] = useState<StatusFilter>("all");
  const signedIn = session.isAuthenticated && !session.isGuest && Boolean(session.token);

  const ordersQuery = useQuery<OrdersResponse>({
    queryKey: ["/api/exportunity/order-records", session.user?.id],
    queryFn: () => apiRequest("/api/exportunity/order-records"),
    enabled: signedIn && !orderNumber,
    staleTime: 15_000,
    retry: false,
  });

  const detailQuery = useQuery<OrderDetailResponse>({
    queryKey: ["/api/exportunity/order-records/detail", orderNumber, session.user?.id],
    queryFn: () => apiRequest(`/api/exportunity/order-records/${encodeURIComponent(String(orderNumber))}`),
    enabled: signedIn && Boolean(orderNumber),
    staleTime: 15_000,
    retry: false,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = orderNumber
      ? `${copy.orderRecord} ${orderNumber} | Exportunity`
      : `${copy.eyebrow} | Exportunity`;
  }, [copy.eyebrow, copy.orderRecord, orderNumber]);

  const orders = ordersQuery.data?.orders || [];
  const counts = useMemo(() => {
    const result: Record<StatusGroup, number> = { open: 0, active: 0, complete: 0, attention: 0 };
    for (const order of orders) result[statusGroup(order.status)] += 1;
    return result;
  }, [orders]);
  const filteredOrders = useMemo(
    () => (filter === "all" ? orders : orders.filter((order) => statusGroup(order.status) === filter)),
    [filter, orders],
  );

  if (!signedIn) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  if (orderNumber) {
    const response = detailQuery.data;
    const order = response?.order;
    const currency = response?.currency || "XOF";
    const progress = progressIndex(order?.status);
    const stages = [
      { label: copy.recorded, icon: FileText },
      { label: copy.confirmed, icon: ShieldCheck },
      { label: copy.preparing, icon: Truck },
      { label: copy.delivered, icon: PackageCheck },
    ];

    return (
      <PageShell>
        <Button
          type="button"
          variant="ghost"
          className="mb-6 -ml-3 text-slate-600 hover:bg-white hover:text-slate-950"
          onClick={() => navigate("/orders")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {copy.backOrders}
        </Button>

        {detailQuery.isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            {copy.loading}
          </div>
        ) : detailQuery.isError || !order ? (
          <div className="rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
            <TriangleAlert className="h-8 w-8 text-rose-600" />
            <h1 className="mt-4 text-2xl font-black">{copy.detailFailed}</h1>
            <Button className="mt-6 bg-[#07111F] text-white hover:bg-[#14243B]" onClick={() => navigate("/orders")}>
              {copy.backOrders}
            </Button>
          </div>
        ) : (
          <div data-testid="exportunity-order-record" className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
              <div className="border-b border-slate-200 bg-[#07111F] p-6 text-white sm:p-8">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#F5A623]">{copy.orderRecord}</p>
                    <h1 className="mt-3 break-all text-3xl font-black tracking-tight sm:text-4xl">{order.orderNumber}</h1>
                    <p className="mt-2 text-sm text-white/60">{order.seller?.name || copy.supplier}</p>
                  </div>
                  <span className={cn("w-fit rounded-full border px-3 py-1.5 text-xs font-black", statusPresentation(order.status, copy).className)}>
                    {statusPresentation(order.status, copy).label}
                  </span>
                </div>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: copy.amount, value: formatExactMoney(order.total, currency, language) },
                    { label: copy.fulfilment, value: order.fulfillmentType === "pickup" ? copy.pickup : copy.delivery },
                    { label: copy.updated, value: formatDate(order.updatedAt, language) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{item.label}</div>
                      <div className="mt-2 text-sm font-bold text-white">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">{copy.recordTrail}</h2>
                  <span className="text-xs font-semibold text-slate-400">{formatDate(order.createdAt, language)}</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  {stages.map(({ label, icon: Icon }, index) => {
                    const reached = index <= progress;
                    return (
                      <div key={label} className={cn("rounded-2xl border p-4", reached ? "border-[#F5A623]/35 bg-[#FFF8E8]" : "border-slate-200 bg-slate-50")}>
                        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", reached ? "bg-[#07111F] text-[#F5A623]" : "bg-slate-200 text-slate-400")}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className={cn("mt-3 text-xs font-black", reached ? "text-slate-950" : "text-slate-400")}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#07111F] text-[#F5A623]"><Boxes className="h-5 w-5" /></span>
                  <div>
                    <h2 className="text-xl font-black">{copy.lines}</h2>
                    <p className="text-xs text-slate-500">{response.items.length} {copy.items}</p>
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  {response.items.map((item) => (
                    <div key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div>
                        <div className="font-black text-slate-950">{item.productName}</div>
                        <div className="mt-1 text-xs text-slate-500">{copy.quantity}: {item.quantity} · {copy.unitPrice}: {formatExactMoney(item.unitPrice, currency, language)}</div>
                      </div>
                      <div className="text-sm font-black text-[#8A5700]">{formatExactMoney(item.subtotal, currency, language)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 space-y-2 border-t border-slate-200 pt-5 text-sm">
                  {[
                    [copy.subtotal, order.subtotal],
                    [copy.deliveryFee, order.deliveryFee],
                    [copy.serviceFee, order.serviceFee],
                    [copy.discount, order.discount],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 text-slate-600"><span>{label}</span><span className="font-bold text-slate-900">{formatExactMoney(value, currency, language)}</span></div>
                  ))}
                  <div className="flex justify-between gap-4 pt-2 text-base font-black text-slate-950"><span>{copy.total}</span><span>{formatExactMoney(order.total, currency, language)}</span></div>
                </div>
              </section>

              <aside className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-black"><Globe2 className="h-4 w-4 text-[#B26F00]" />{copy.destination}</div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{order.deliveryAddress || copy.noDestination}</p>
                </div>
                <div className="rounded-3xl border border-[#F5A623]/30 bg-[#FFF8E8] p-6">
                  <div className="flex items-center gap-2 text-sm font-black text-[#07111F]"><ShieldCheck className="h-4 w-4 text-emerald-700" />{copy.readOnly}</div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{copy.readOnlyBody}</p>
                </div>
                <div className="rounded-3xl bg-[#07111F] p-6 text-white shadow-lg">
                  <MessageSquareText className="h-6 w-6 text-[#F5A623]" />
                  <h2 className="mt-4 text-lg font-black">{copy.nextTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-white/65">{copy.nextBody}</p>
                  <Button asChild className="mt-5 w-full bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]">
                    <Link href="/">{copy.talkAwa}<ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                </div>
              </aside>
            </div>
          </div>
        )}
      </PageShell>
    );
  }

  const filters: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "all", label: copy.all, count: orders.length },
    { key: "open", label: copy.open, count: counts.open },
    { key: "active", label: copy.active, count: counts.active },
    { key: "complete", label: copy.complete, count: counts.complete },
    { key: "attention", label: copy.attention, count: counts.attention },
  ];

  return (
    <PageShell>
      <div data-testid="exportunity-trade-orders-page">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F5A623]/35 bg-[#FFF8E8] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#8A5700]">
              <FileText className="h-3.5 w-3.5" />
              {copy.eyebrow}
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.04] tracking-[-0.04em] sm:text-5xl">{copy.title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{copy.description}</p>
          </div>
          <div className="rounded-3xl bg-[#07111F] p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F5A623]">{copy.records}</span>
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="mt-3 text-4xl font-black">{orders.length}</div>
            <p className="mt-2 text-xs leading-5 text-white/55">{copy.readOnlyBody}</p>
          </div>
        </section>

        <section className="mt-9 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs font-black transition",
                    filter === item.key
                      ? "border-[#07111F] bg-[#07111F] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-[#F5A623] hover:text-slate-950",
                  )}
                >
                  {item.label} <span className={cn("ml-1", filter === item.key ? "text-[#F5A623]" : "text-slate-400")}>{item.count}</span>
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 font-bold"
              disabled={ordersQuery.isFetching}
              onClick={() => ordersQuery.refetch()}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", ordersQuery.isFetching && "animate-spin")} />
              {ordersQuery.isFetching ? copy.refreshing : copy.refresh}
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {ordersQuery.isLoading ? (
              <div className="py-16 text-center text-sm text-slate-500">{copy.loading}</div>
            ) : ordersQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
                <TriangleAlert className="mx-auto h-8 w-8 text-rose-600" />
                <div className="mt-3 font-black text-rose-950">{copy.loadFailed}</div>
                <Button variant="outline" className="mt-4 border-rose-200 bg-white" onClick={() => ordersQuery.refetch()}>{copy.retry}</Button>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
                <Boxes className="mx-auto h-10 w-10 text-slate-300" />
                <h2 className="mt-4 text-lg font-black">{copy.empty}</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{copy.emptyBody}</p>
                <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                  <Button asChild className="bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]"><Link href="/">{copy.talkAwa}</Link></Button>
                  <Button asChild variant="outline" className="border-slate-200 font-black"><Link href="/industrial">{copy.explore}</Link></Button>
                </div>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const status = statusPresentation(order.status, copy);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => navigate(`/orders/${encodeURIComponent(order.orderNumber)}`)}
                    className="group grid w-full gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#F5A623]/60 hover:shadow-lg sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#07111F] text-[#F5A623]"><FileText className="h-5 w-5" /></span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-all font-black text-slate-950">{order.orderNumber}</span>
                          <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide", status.className)}>{status.label}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>{order.seller?.name || copy.supplier}</span>
                          <span>{order.itemsCount} {copy.items}</span>
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{copy.created} {formatDate(order.createdAt, language)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-right text-base font-black text-[#8A5700]">{formatExactMoney(order.total, ordersQuery.data?.currency || "XOF", language)}</div>
                      <span className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 transition group-hover:border-[#F5A623] group-hover:bg-[#FFF8E8] group-hover:text-[#8A5700]"><ArrowRight className="h-4 w-4" /></span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#F5A623]/30 bg-[#FFF8E8] p-5">
            <div className="flex items-center gap-2 font-black"><ShieldCheck className="h-5 w-5 text-emerald-700" />{copy.readOnly}</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{copy.readOnlyBody}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 font-black"><MessageSquareText className="h-5 w-5 text-[#B26F00]" />Awa</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{copy.nextBody}</p>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
