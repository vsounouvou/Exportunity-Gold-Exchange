import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { useLocation } from "wouter";

export type MobilityBus = {
  id: number;
  slug: string;
  name: string;
  reference: string;
  category: string;
  description?: string | null;
  capacity: number;
  seatSelectionEnabled: boolean;
  seatLayout: { columns: number; aisleAfter: number; labels: string[] };
  amenities: string[];
  rangeKm?: number | null;
  chargingMinutes?: number | null;
  intendedUse?: string | null;
  heroImageUrl?: string | null;
  model3dUrl?: string | null;
  specificationsStatus: string;
  availabilityStatus: string;
  active: boolean;
};

export type MobilityRoute = {
  id: number;
  slug: string;
  origin: string;
  destination: string;
  boardingPoint: string;
  arrivalPoint: string;
  durationMinutes: number;
  baseFareXof: number;
  description?: string | null;
  active: boolean;
};

export type MobilityTrip = {
  id: number;
  routeId: number;
  busId: number;
  departureAt: string;
  arrivalAt: string;
  fareXof: number;
  status: string;
  bookingOpen: boolean;
  notes?: string | null;
};

export type TripResult = {
  trip: MobilityTrip;
  route: MobilityRoute;
  bus: MobilityBus;
  remainingSeats: number;
  bookable?: boolean;
};

export type MobilityBootstrap = {
  ok: boolean;
  demoMode: boolean;
  currency: "XOF";
  holdMinutes: number;
  buses: MobilityBus[];
  routes: MobilityRoute[];
  upcoming: TripResult[];
};

export type PassengerInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  identificationReference: string;
  assistanceNote: string;
};

export type BookingSession = {
  tripId?: number;
  passengerCount: number;
  seatNumbers: string[];
  reference?: string;
  accessToken?: string;
  contactEmail?: string;
  contactPhone?: string;
  passengers?: PassengerInput[];
};

const BOOKING_KEY = "agoojiye_mobility_booking_v1";

export function getBookingSession(): BookingSession {
  if (typeof window === "undefined") return { passengerCount: 1, seatNumbers: [] };
  try {
    const value = JSON.parse(sessionStorage.getItem(BOOKING_KEY) || "null");
    if (value && typeof value === "object") return { passengerCount: 1, seatNumbers: [], ...value };
  } catch {
    // Ignore an invalid previous checkout session.
  }
  return { passengerCount: 1, seatNumbers: [] };
}

export function setBookingSession(patch: Partial<BookingSession>) {
  const next = { ...getBookingSession(), ...patch };
  sessionStorage.setItem(BOOKING_KEY, JSON.stringify(next));
  return next;
}

export function clearBookingSession() {
  sessionStorage.removeItem(BOOKING_KEY);
}

export type MobilityAnalyticsEvent =
  | "trip_search"
  | "trip_selected"
  | "booking_started"
  | "seat_selected"
  | "payment_started"
  | "payment_completed"
  | "ticket_downloaded"
  | "full_bus_request_submitted"
  | "demo_request_submitted"
  | "bus_order_request_submitted"
  | "waitlist_joined"
  | "3d_experience_opened";

export function trackMobilityEvent(event: MobilityAnalyticsEvent, data: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("agoojiye:analytics", { detail: { event, data, at: new Date().toISOString() } }));
}

export function formatXof(value: number | string | null | undefined) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0))} FCFA`;
}

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("fr-BJ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatTime(value: string | Date) {
  return new Intl.DateTimeFormat("fr-BJ", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function useMobilityMeta(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} | AGOOJIYE`;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [description, title]);
}

const navItems = [
  ["/", "Accueil"],
  ["/reserver", "Acheter un billet"],
  ["/trajets", "Nos trajets"],
  ["/bus", "Nos bus"],
  ["/experience-3d", "Expérience 3D"],
  ["/reserver-un-bus", "Réserver un bus"],
  ["/demonstration", "Démonstration"],
  ["/commander", "Commander un bus"],
  ["/a-propos", "À propos"],
  ["/contact", "Contact"],
] as const;

export function MobilityLayout({ children, active }: { children: ReactNode; active?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#f5f3ee] text-[#171917]">
      <header className="sticky top-0 z-50 border-b border-black/10 bg-[#0b0d0c]/95 text-white backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <a href="/" className="shrink-0" aria-label="Accueil AGOOJIYE">
            <img src="/brand/agoojiye/logo/AGOOJIYE_logo_horizontal_transparent.png" alt="AGOOJIYE" width={947} height={183} className="h-9 w-auto max-w-[170px] object-contain object-left" />
          </a>
          <nav className="ml-auto hidden items-center gap-4 xl:flex" aria-label="Navigation principale">
            {navItems.filter(([href]) => !["/reserver", "/reserver-un-bus"].includes(href)).map(([href, label]) => (
              <a key={href} href={href} className={`text-sm font-medium transition-colors hover:text-[#e0b84f] ${active === href ? "text-[#e0b84f]" : "text-white/80"}`}>{label}</a>
            ))}
          </nav>
          <a href="/reserver-un-bus" className="ml-auto hidden border border-white/25 px-3 py-2 text-sm font-semibold text-white hover:border-[#e0b84f] lg:inline-flex xl:ml-0">Réserver un bus</a>
          <a href="/reserver" className="hidden bg-[#d6a82e] px-4 py-2 text-sm font-bold text-[#111] hover:bg-[#edc75f] sm:inline-flex">Acheter un billet</a>
          <button type="button" onClick={() => setMenuOpen((value) => !value)} className="ml-auto inline-grid h-11 w-11 place-items-center border border-white/20 sm:ml-0 xl:hidden" aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen ? (
          <nav className="border-t border-white/10 bg-[#0b0d0c] px-4 py-3 xl:hidden" aria-label="Navigation mobile">
            <div className="mx-auto grid max-w-7xl sm:grid-cols-2">
              {navItems.map(([href, label]) => <a key={href} href={href} className="border-b border-white/10 px-2 py-3 text-sm font-medium text-white/90">{label}</a>)}
            </div>
          </nav>
        ) : null}
      </header>
      <main>{children}</main>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white p-3 shadow-[0_-6px_24px_rgba(0,0,0,0.12)] sm:hidden">
        <a href="/reserver" className="flex min-h-12 items-center justify-center bg-[#d6a82e] px-4 text-base font-bold text-[#111]">Acheter un billet</a>
      </div>
      <footer className="bg-[#0b0d0c] pb-24 text-white sm:pb-0">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <img src="/brand/agoojiye/logo/AGOOJIYE_logo_horizontal_transparent.png" alt="AGOOJIYE" width={947} height={183} loading="lazy" className="h-10 w-auto object-contain object-left" />
            <p className="mt-4 max-w-md text-sm leading-6 text-white/65">Mobilité électrique conçue depuis le Bénin pour des déplacements simples, confortables et adaptés aux réalités africaines.</p>
          </div>
          <div>
            <p className="font-semibold text-[#e0b84f]">Voyager</p>
            <div className="mt-3 grid gap-2 text-sm text-white/70"><a href="/reserver">Acheter un billet</a><a href="/retrouver-ma-reservation">Retrouver ma réservation</a><a href="/trajets">Voir les trajets</a><a href="/faq">FAQ</a></div>
          </div>
          <div>
            <p className="font-semibold text-[#e0b84f]">AGOOJIYE</p>
            <div className="mt-3 grid gap-2 text-sm text-white/70"><a href="/bus">Nos bus</a><a href="/commander">Commander un bus</a><a href="/liste-prioritaire">Liste prioritaire</a><a href="mailto:contact@agoojiye.com">contact@agoojiye.com</a></div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description: string }) {
  return (
    <section className="bg-[#111412] text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
        {eyebrow ? <p className="text-xs font-bold uppercase text-[#e0b84f]">{eyebrow}</p> : null}
        <h1 className="mt-3 max-w-4xl text-4xl font-bold leading-tight md:text-6xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/70 md:text-lg">{description}</p>
      </div>
    </section>
  );
}

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-black/60" role="status">{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="mx-auto my-8 max-w-3xl border border-red-300 bg-red-50 p-5 text-red-900" role="alert"><p className="font-semibold">Une erreur est survenue</p><p className="mt-1 text-sm">{message}</p>{onRetry ? <button type="button" onClick={onRetry} className="mt-4 border border-red-400 px-3 py-2 text-sm font-semibold">Réessayer</button> : null}</div>;
}

export function TripSearchForm({ routes = [], compact = false }: { routes?: MobilityRoute[]; compact?: boolean }) {
  const [, navigate] = useLocation();
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [origin, setOrigin] = useState(params.get("origin") || "Cotonou");
  const [destination, setDestination] = useState(params.get("destination") || "Porto-Novo");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(params.get("date") || tomorrow);
  const [passengers, setPassengers] = useState(Math.max(1, Number(params.get("passengers") || 1)));
  const cities = [...new Set(routes.flatMap((route) => [route.origin, route.destination]))];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    trackMobilityEvent("trip_search", { origin, destination, date, passengers });
    navigate(`/trajets?${new URLSearchParams({ origin, destination, date, passengers: String(passengers) }).toString()}`);
  };
  return (
    <form onSubmit={submit} className={`grid gap-3 ${compact ? "md:grid-cols-[1fr_1fr_1fr_130px_auto]" : "md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_130px_auto]"}`}>
      <label className="grid gap-1 text-sm font-semibold"><span>Départ</span><input list="agoojiye-cities" value={origin} onChange={(event) => setOrigin(event.target.value)} required className="h-12 border border-black/20 bg-white px-3 text-base text-[#171917] outline-none focus:border-[#15803d]" /></label>
      <label className="grid gap-1 text-sm font-semibold"><span>Destination</span><input list="agoojiye-cities" value={destination} onChange={(event) => setDestination(event.target.value)} required className="h-12 border border-black/20 bg-white px-3 text-base text-[#171917] outline-none focus:border-[#15803d]" /></label>
      <datalist id="agoojiye-cities">{cities.map((city) => <option key={city} value={city} />)}</datalist>
      <label className="grid gap-1 text-sm font-semibold"><span>Date du voyage</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(event) => setDate(event.target.value)} required className="h-12 border border-black/20 bg-white px-3 text-base text-[#171917] outline-none focus:border-[#15803d]" /></label>
      <label className="grid gap-1 text-sm font-semibold"><span>Passagers</span><input type="number" min={1} max={8} value={passengers} onChange={(event) => setPassengers(Math.max(1, Number(event.target.value)))} required className="h-12 border border-black/20 bg-white px-3 text-base text-[#171917] outline-none focus:border-[#15803d]" /></label>
      <button type="submit" className="mt-auto min-h-12 bg-[#15803d] px-5 font-bold text-white hover:bg-[#116631]">Voir les trajets</button>
    </form>
  );
}
