import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BatteryCharging, Bus, CheckCircle2, Clock3, Leaf, MapPin, ShieldCheck, Smartphone, Users, Wrench } from "lucide-react";
import { useLocation } from "wouter";

import { apiRequest } from "@/lib/queryClient";
import {
  ErrorState,
  LoadingState,
  MobilityLayout,
  PageHeader,
  TripSearchForm,
  formatDateTime,
  formatTime,
  formatXof,
  setBookingSession,
  trackMobilityEvent,
  useMobilityMeta,
  type MobilityBootstrap,
  type MobilityBus,
  type TripResult,
} from "./mobility-core";

function useBootstrap() {
  return useQuery<MobilityBootstrap>({
    queryKey: ["/api/agoojye/mobility/bootstrap"],
    queryFn: () => apiRequest("/api/agoojye/mobility/bootstrap", "GET"),
    staleTime: 60_000,
  });
}

function Availability({ remaining, status }: { remaining: number; status: string }) {
  if (status === "cancelled") return <span className="text-sm font-bold text-red-700">Annulé</span>;
  if (remaining <= 0) return <span className="text-sm font-bold text-red-700">Complet</span>;
  if (remaining <= 5) return <span className="text-sm font-bold text-amber-700">Plus que {remaining} places</span>;
  return <span className="text-sm font-bold text-[#15803d]">{remaining} places disponibles</span>;
}

function TripCard({ row, passengers = 1 }: { row: TripResult; passengers?: number }) {
  const bookable = row.bookable ?? (row.remainingSeats >= passengers && row.trip.bookingOpen && ["scheduled", "boarding"].includes(row.trip.status));
  return (
    <article className="border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-[#805f12]">{row.bus.name}</p>
          <h3 className="mt-1 text-xl font-bold">{row.route.origin} → {row.route.destination}</h3>
        </div>
        <Availability remaining={Number(row.remainingSeats)} status={row.trip.status} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 border-y border-black/10 py-4 text-sm sm:grid-cols-4">
        <div><p className="text-black/50">Départ</p><p className="mt-1 font-bold">{formatTime(row.trip.departureAt)}</p></div>
        <div><p className="text-black/50">Arrivée estimée</p><p className="mt-1 font-bold">{formatTime(row.trip.arrivalAt)}</p></div>
        <div><p className="text-black/50">Embarquement</p><p className="mt-1 font-semibold">{row.route.boardingPoint}</p></div>
        <div><p className="text-black/50">Prix / personne</p><p className="mt-1 text-lg font-bold text-[#805f12]">{formatXof(row.trip.fareXof)}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/55">{row.bus.amenities.slice(0, 3).join(" · ")}</p>
        {bookable ? <a href={`/trajets/${row.trip.id}?passengers=${passengers}`} className="inline-flex min-h-11 items-center gap-2 bg-[#171917] px-4 font-bold text-white hover:bg-[#15803d]">Choisir ce trajet <ArrowRight size={18} /></a> : <span className="text-sm font-semibold text-black/45">Réservation indisponible</span>}
      </div>
    </article>
  );
}

function BusCard({ bus }: { bus: MobilityBus }) {
  return (
    <article className="overflow-hidden border border-black/10 bg-white shadow-sm">
      <img src={bus.heroImageUrl || "/tenants/agoojye/bus-placeholder.svg"} alt={`${bus.name}, bus électrique AGOOJIYE`} width={1280} height={853} loading="lazy" className="aspect-[4/3] w-full object-cover" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[#805f12]">{bus.category}</p><h3 className="mt-1 text-2xl font-bold">{bus.name}</h3></div>{bus.specificationsStatus === "placeholder" ? <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">Données indicatives</span> : null}</div>
        <p className="mt-3 text-sm leading-6 text-black/65">{bus.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-black/10 py-4 text-sm"><div><dt className="text-black/50">Capacité</dt><dd className="font-bold">{bus.capacity} passagers</dd></div><div><dt className="text-black/50">Autonomie indicative</dt><dd className="font-bold">{bus.rangeKm ? `${bus.rangeKm} km` : "À confirmer"}</dd></div></dl>
        <div className="mt-4 flex flex-wrap gap-2"><a href={`/bus/${bus.slug}`} className="inline-flex min-h-10 items-center border border-black/20 px-3 text-sm font-bold">Voir le modèle</a><a href={`/experience-3d?bus=${bus.slug}`} className="inline-flex min-h-10 items-center bg-[#171917] px-3 text-sm font-bold text-white">Explorer en 3D</a></div>
      </div>
    </article>
  );
}

export function AgoojiyeMobilityHomePage() {
  useMobilityMeta("Mobilité électrique au Bénin", "Réservez un trajet, choisissez votre place et voyagez avec les bus électriques AGOOJIYE.");
  const bootstrap = useBootstrap();
  useEffect(() => {
    const id = "agoojiye-mobility-structured-data";
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = id;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "AGOOJIYE",
      url: "https://agoojiye.com",
      logo: "https://agoojiye.com/brand/agoojiye/logo/AGOOJIYE_logo_primary_transparent.png",
      description: "Marque béninoise de bus électriques et plateforme de mobilité.",
      areaServed: { "@type": "Country", name: "Bénin" },
    });
    return () => { script?.remove(); };
  }, []);
  return (
    <MobilityLayout active="/">
      <section className="relative h-[calc(100svh-5rem)] min-h-[560px] max-h-[680px] overflow-hidden bg-[#0b0d0c] text-white">
        <picture className="absolute inset-0">
          <source media="(max-width: 767px)" srcSet="/brand/agoojiye/vehicle/mobile/agoojiye-shuttle-hero-mobile-768.avif" type="image/avif" />
          <source srcSet="/brand/agoojiye/vehicle/hero/agoojiye-shuttle-hero-1916.avif" type="image/avif" />
          <img src="/brand/agoojiye/vehicle/hero/agoojiye-shuttle-hero-1280.jpg" alt="Bus électrique AGOOJIYE au Bénin" width={1916} height={1000} fetchPriority="high" className="h-full w-full object-cover object-center md:object-right" />
        </picture>
        <div className="absolute inset-0 bg-black/55 md:bg-black/35" />
        <div className="relative mx-auto flex h-full max-w-7xl items-end px-4 pb-12 pt-28 sm:px-6 md:items-center md:pb-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase text-[#edc75f]">Mobilité électrique née au Bénin</p>
            <h1 className="mt-4 text-5xl font-bold leading-[1.05] md:text-7xl">La mobilité électrique du Bénin commence ici.</h1>
            <p className="mt-5 max-w-xl text-lg leading-7 text-white/85">Réservez votre trajet, choisissez votre place et voyagez à bord des bus électriques AGOOJIYE.</p>
            <div className="mt-7 flex flex-wrap gap-3"><a href="/reserver" className="inline-flex min-h-12 items-center bg-[#d6a82e] px-5 font-bold text-[#111]">Acheter un billet</a><a href="/experience-3d" className="inline-flex min-h-12 items-center border border-white/50 bg-black/20 px-5 font-bold text-white">Visiter le bus en 3D</a></div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:-mt-10 md:relative md:z-10 md:shadow-xl">
          <div className="mb-5"><p className="text-xs font-bold uppercase text-[#805f12]">Votre prochain départ</p><h2 className="mt-1 text-2xl font-bold">Trouvez un trajet</h2></div>
          <TripSearchForm routes={bootstrap.data?.routes} />
        </div>
      </section>

      <section className="bg-[#f5f3ee]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase text-[#805f12]">Pourquoi AGOOJIYE</p><h2 className="mt-2 text-4xl font-bold">Une mobilité pratique, propre et pensée ici.</h2></div>
          <div className="mt-9 grid gap-px overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [BatteryCharging, "Mobilité électrique", "Des déplacements alimentés par une technologie électrique adaptée à nos villes."],
              [ShieldCheck, "Innovation béninoise", "Une marque construite depuis le Bénin avec une ambition industrielle africaine."],
              [Users, "Confort utile", "Des espaces pensés pour les passagers, les groupes et les usages quotidiens."],
              [Smartphone, "Réservation simple", "Cherchez, choisissez, payez en mode démonstration et recevez votre billet QR."],
              [Leaf, "Moins d'émissions", "Une voie concrète vers des transports urbains plus silencieux et plus propres."],
              [Wrench, "Pensé pour nos routes", "Des solutions configurables selon les villes, les opérateurs et les usages africains."],
            ].map(([Icon, title, text]) => <div key={String(title)} className="bg-white p-6"><Icon className="text-[#15803d]" size={28} /><h3 className="mt-4 text-xl font-bold">{String(title)}</h3><p className="mt-2 text-sm leading-6 text-black/60">{String(text)}</p></div>)}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase text-[#805f12]">Départs à venir</p><h2 className="mt-2 text-4xl font-bold">Trajets disponibles</h2></div><a href="/trajets" className="inline-flex items-center gap-2 font-bold text-[#15803d]">Voir tous les trajets <ArrowRight size={18} /></a></div>
          {bootstrap.isLoading ? <LoadingState label="Chargement des départs…" /> : bootstrap.isError ? <ErrorState message={(bootstrap.error as Error).message} onRetry={() => bootstrap.refetch()} /> : <div className="mt-8 grid gap-4 lg:grid-cols-2">{bootstrap.data?.upcoming.slice(0, 4).map((row) => <TripCard key={row.trip.id} row={row} />)}</div>}
        </div>
      </section>

      <section className="bg-[#101311] text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase text-[#e0b84f]">La gamme</p><h2 className="mt-2 text-4xl font-bold">Des bus pour plusieurs usages</h2></div><a href="/bus" className="font-bold text-[#e0b84f]">Découvrir nos bus</a></div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">{bootstrap.data?.buses.map((bus) => <BusCard key={bus.id} bus={bus} />)}</div>
        </div>
      </section>

      <section className="bg-[#d9e8dc]">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
          <div><p className="text-xs font-bold uppercase text-[#166534]">Expérience interactive</p><h2 className="mt-2 text-4xl font-bold">Montez à bord avant le départ.</h2><p className="mt-4 max-w-xl leading-7 text-black/65">Tournez autour du bus, inspectez l’espace passagers et découvrez les principaux équipements dans une expérience 3D légère.</p><a href="/experience-3d" className="mt-6 inline-flex min-h-12 items-center bg-[#171917] px-5 font-bold text-white">Visiter le bus en 3D</a></div>
          <img src="/brand/agoojiye/vehicle/sections/agoojiye-shuttle-side-profile-1280.webp" alt="Vue latérale du bus électrique AGOOJIYE" width={1280} height={853} loading="lazy" className="aspect-[16/10] w-full object-cover" />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><h2 className="text-4xl font-bold">Choisissez votre besoin</h2><div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[
          ["Acheter une place", "Réservez un trajet régulier et recevez votre billet QR.", "/reserver"],
          ["Réserver un bus entier", "Pour une entreprise, une école, un événement ou un groupe.", "/reserver-un-bus"],
          ["Demander une démonstration", "Visite, présentation, essai ou présence lors d'un événement.", "/demonstration"],
          ["Commander un bus", "Échangez avec notre équipe sur un besoin de flotte.", "/commander"],
        ].map(([title, text, href]) => <a key={href} href={href} className="border border-black/10 p-5 hover:border-[#15803d]"><h3 className="text-xl font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-black/60">{text}</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#15803d]">Continuer <ArrowRight size={16} /></span></a>)}</div></div>
      </section>

      <section className="bg-[#d6a82e] text-[#111]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6"><div><p className="text-sm font-bold uppercase">Soyez parmi les premiers</p><h2 className="mt-2 text-3xl font-bold">Premiers trajets, nouvelles lignes et démonstrations.</h2></div><a href="/liste-prioritaire" className="inline-flex min-h-12 items-center bg-[#111] px-5 font-bold text-white">Rejoindre la liste prioritaire</a></div>
      </section>
    </MobilityLayout>
  );
}

export function AgoojiyeTripsPage() {
  useMobilityMeta("Nos trajets", "Consultez les prochains départs AGOOJIYE et le nombre de places disponibles.");
  const params = useMemo(() => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""), []);
  const query = new URLSearchParams();
  for (const key of ["origin", "destination", "date", "passengers"]) if (params.get(key)) query.set(key, params.get(key)!);
  if (!query.has("passengers")) query.set("passengers", "1");
  const bootstrap = useBootstrap();
  const trips = useQuery<{ ok: boolean; trips: TripResult[] }>({ queryKey: [`/api/agoojye/mobility/trips?${query}`], queryFn: () => apiRequest(`/api/agoojye/mobility/trips?${query}`, "GET") });
  const passengers = Math.max(1, Number(query.get("passengers") || 1));
  return <MobilityLayout active="/trajets"><PageHeader eyebrow="Billetterie" title="Trouvez votre prochain trajet" description="Comparez les horaires, les prix et les places restantes. Les horaires affichés sont des données de démonstration configurables." /><section className="bg-white"><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><TripSearchForm routes={bootstrap.data?.routes} compact /></div></section><section><div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">{trips.isLoading ? <LoadingState label="Recherche des trajets…" /> : trips.isError ? <ErrorState message={(trips.error as Error).message} onRetry={() => trips.refetch()} /> : trips.data?.trips.length ? <div className="grid gap-4 lg:grid-cols-2">{trips.data.trips.map((row) => <TripCard key={row.trip.id} row={row} passengers={passengers} />)}</div> : <div className="border border-black/10 bg-white p-8 text-center"><Bus className="mx-auto text-black/35" size={34} /><h2 className="mt-3 text-2xl font-bold">Aucun trajet disponible</h2><p className="mt-2 text-black/60">Essayez une autre date ou un autre itinéraire.</p></div>}</div></section></MobilityLayout>;
}

export function AgoojiyeTripDetailPage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""), []);
  const passengers = Math.max(1, Math.min(8, Number(params.get("passengers") || 1)));
  const trip = useQuery<TripResult & { ok: boolean; seats: Array<{ seatNumber: string; status: string }>; remainingSeats: number }>({ queryKey: [`/api/agoojye/mobility/trips/${id}`], queryFn: () => apiRequest(`/api/agoojye/mobility/trips/${id}`, "GET") });
  useMobilityMeta("Détail du trajet", "Consultez l'horaire, le point d'embarquement et choisissez vos places AGOOJIYE.");
  const choose = () => { setBookingSession({ tripId: Number(id), passengerCount: passengers, seatNumbers: [], reference: undefined, accessToken: undefined }); trackMobilityEvent("trip_selected", { tripId: Number(id), passengers }); navigate("/reservation/sieges"); };
  if (trip.isLoading) return <MobilityLayout><LoadingState label="Chargement du trajet…" /></MobilityLayout>;
  if (trip.isError || !trip.data) return <MobilityLayout><ErrorState message={(trip.error as Error)?.message || "Trajet introuvable."} /></MobilityLayout>;
  const row = trip.data;
  const bookable = row.remainingSeats >= passengers && row.trip.bookingOpen && ["scheduled", "boarding"].includes(row.trip.status) && new Date(row.trip.departureAt) > new Date();
  return <MobilityLayout active="/trajets"><PageHeader eyebrow="Votre trajet" title={`${row.route.origin} → ${row.route.destination}`} description={formatDateTime(row.trip.departureAt)} /><section><div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_360px]"><div className="bg-white p-6"><h2 className="text-2xl font-bold">Informations de voyage</h2><dl className="mt-6 grid gap-5 sm:grid-cols-2"><div><dt className="text-sm text-black/50">Départ</dt><dd className="mt-1 font-bold">{formatDateTime(row.trip.departureAt)}</dd></div><div><dt className="text-sm text-black/50">Arrivée estimée</dt><dd className="mt-1 font-bold">{formatDateTime(row.trip.arrivalAt)}</dd></div><div><dt className="text-sm text-black/50">Point d'embarquement</dt><dd className="mt-1 font-bold">{row.route.boardingPoint}</dd></div><div><dt className="text-sm text-black/50">Destination</dt><dd className="mt-1 font-bold">{row.route.arrivalPoint}</dd></div><div><dt className="text-sm text-black/50">Bus</dt><dd className="mt-1 font-bold">{row.bus.name} · {row.bus.reference}</dd></div><div><dt className="text-sm text-black/50">Durée estimée</dt><dd className="mt-1 font-bold">{row.route.durationMinutes} min</dd></div></dl><div className="mt-6 border-t border-black/10 pt-5"><p className="text-sm text-black/50">À bord</p><p className="mt-2">{row.bus.amenities.join(" · ")}</p></div></div><aside className="h-fit bg-[#111412] p-6 text-white"><Availability remaining={row.remainingSeats} status={row.trip.status} /><p className="mt-5 text-sm text-white/60">Prix pour {passengers} passager{passengers > 1 ? "s" : ""}</p><p className="mt-1 text-3xl font-bold text-[#e0b84f]">{formatXof(row.trip.fareXof * passengers)}</p><button type="button" onClick={choose} disabled={!bookable} className="mt-6 min-h-12 w-full bg-[#d6a82e] px-4 font-bold text-[#111] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50">{bookable ? "Choisir mes places" : "Réservation indisponible"}</button><p className="mt-4 text-xs leading-5 text-white/50">Paiement de démonstration clairement identifié. Aucune transaction réelle n'est effectuée.</p></aside></div></section></MobilityLayout>;
}

export function AgoojiyeBusCatalogPage() {
  useMobilityMeta("Nos bus électriques", "Découvrez les modèles de bus électriques AGOOJIYE et leurs usages au Bénin.");
  const bootstrap = useBootstrap();
  return <MobilityLayout active="/bus"><PageHeader eyebrow="Gamme électrique" title="Des bus conçus pour la mobilité africaine" description="Les valeurs techniques marquées comme indicatives sont des données de démonstration à remplacer après validation d'ingénierie." /><section><div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">{bootstrap.isLoading ? <LoadingState /> : <div className="grid gap-5 lg:grid-cols-3">{bootstrap.data?.buses.map((bus) => <BusCard key={bus.id} bus={bus} />)}</div>}</div></section></MobilityLayout>;
}

export function AgoojiyeBusDetailPage({ slug }: { slug: string }) {
  useMobilityMeta("Bus électrique", "Découvrez un modèle de bus électrique AGOOJIYE, ses usages et son expérience 3D.");
  const bootstrap = useBootstrap();
  const bus = bootstrap.data?.buses.find((item) => item.slug === slug);
  if (bootstrap.isLoading) return <MobilityLayout><LoadingState /></MobilityLayout>;
  if (!bus) return <MobilityLayout><ErrorState message="Modèle de bus introuvable." /></MobilityLayout>;
  return <MobilityLayout active="/bus"><section className="bg-[#0b0d0c] text-white"><div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2"><div><p className="text-xs font-bold uppercase text-[#e0b84f]">{bus.category}</p><h1 className="mt-3 text-5xl font-bold">{bus.name}</h1><p className="mt-4 max-w-xl text-lg leading-7 text-white/70">{bus.description}</p><div className="mt-7 flex flex-wrap gap-3"><a href="/reserver" className="inline-flex min-h-12 items-center bg-[#d6a82e] px-5 font-bold text-[#111]">Acheter un billet</a><a href={`/experience-3d?bus=${bus.slug}`} className="inline-flex min-h-12 items-center border border-white/30 px-5 font-bold">Explorer en 3D</a></div></div><img src={bus.heroImageUrl || "/tenants/agoojye/bus-placeholder.svg"} alt={bus.name} width={1280} height={853} className="aspect-[4/3] w-full object-cover" /></div></section><section className="bg-white"><div className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><div className="flex items-center gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><CheckCircle2 size={20} /><p><strong>Spécifications indicatives.</strong> Les chiffres ci-dessous sont configurables et ne constituent pas une fiche d'homologation.</p></div><div className="mt-8 grid gap-px bg-black/10 sm:grid-cols-2 lg:grid-cols-4"><div className="bg-[#f5f3ee] p-5"><Users /><p className="mt-3 text-sm text-black/50">Capacité</p><p className="text-2xl font-bold">{bus.capacity}</p></div><div className="bg-[#f5f3ee] p-5"><BatteryCharging /><p className="mt-3 text-sm text-black/50">Autonomie indicative</p><p className="text-2xl font-bold">{bus.rangeKm || "À confirmer"} km</p></div><div className="bg-[#f5f3ee] p-5"><Clock3 /><p className="mt-3 text-sm text-black/50">Recharge indicative</p><p className="text-2xl font-bold">{bus.chargingMinutes ? `${Math.round(bus.chargingMinutes / 60)} h` : "À confirmer"}</p></div><div className="bg-[#f5f3ee] p-5"><MapPin /><p className="mt-3 text-sm text-black/50">Usage</p><p className="mt-1 font-bold">{bus.intendedUse}</p></div></div><div className="mt-12 grid gap-8 lg:grid-cols-2"><div><h2 className="text-3xl font-bold">Confort et usage</h2><p className="mt-4 leading-7 text-black/65">Une configuration pensée pour faciliter l'embarquement, la circulation à bord et le service quotidien. Les équipements sont adaptés selon la mission du véhicule.</p><ul className="mt-5 grid gap-3">{bus.amenities.map((item) => <li key={item} className="flex items-center gap-3"><CheckCircle2 size={18} className="text-[#15803d]" />{item}</li>)}</ul></div><div><h2 className="text-3xl font-bold">Demander une présentation</h2><p className="mt-4 leading-7 text-black/65">Écoles, collectivités, opérateurs, hôtels et entreprises peuvent organiser une visite ou discuter d'une flotte.</p><div className="mt-5 flex flex-wrap gap-3"><a href="/demonstration" className="inline-flex min-h-11 items-center bg-[#171917] px-4 font-bold text-white">Demander une démonstration</a><a href="/commander" className="inline-flex min-h-11 items-center border border-black/20 px-4 font-bold">Commander un bus</a><a href="/reserver-un-bus" className="inline-flex min-h-11 items-center border border-black/20 px-4 font-bold">Réserver le bus</a></div></div></div></div></section></MobilityLayout>;
}

export function AgoojiyeAboutPage() {
  useMobilityMeta("À propos", "AGOOJIYE est une marque béninoise de mobilité électrique et de services de transport.");
  return <MobilityLayout active="/a-propos"><PageHeader eyebrow="Née au Bénin" title="Une marque de bus et un service de mobilité" description="AGOOJIYE relie innovation véhicule, expérience passager et ambition industrielle africaine." /><section className="bg-white"><div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2"><div><h2 className="text-3xl font-bold">Construire une mobilité utile</h2><p className="mt-4 leading-7 text-black/65">Le projet réunit ingénierie, fabrication, logiciel, opérations et partenariats pour proposer des déplacements électriques simples à réserver et des véhicules adaptés aux besoins des organisations.</p></div><img src="/brand/agoojiye/vehicle/sections/agoojiye-shuttle-factory-1280.webp" alt="Équipe autour du bus électrique AGOOJIYE" width={1280} height={853} loading="lazy" className="aspect-[16/10] w-full object-cover" /></div></section></MobilityLayout>;
}

export function AgoojiyeFaqPage() {
  useMobilityMeta("Questions fréquentes", "Réponses sur les billets, paiements, réservations et demandes AGOOJIYE.");
  const items = [["Les paiements sont-ils réels ?", "Le lancement utilise un fournisseur de paiement de démonstration clairement indiqué. Aucun débit réel n'est effectué tant que les identifiants d'un fournisseur agréé ne sont pas configurés."], ["Comment recevoir mon billet ?", "Après confirmation du paiement, chaque passager reçoit un billet numérique avec un QR code unique, affichable et imprimable."], ["Puis-je réserver tout le bus ?", "Oui. La demande de bus entier est séparée de la billetterie et permet de préciser l'itinéraire, les horaires et le nombre de passagers."], ["Les caractéristiques des bus sont-elles définitives ?", "Les valeurs marquées comme indicatives sont des données de démonstration. Elles seront remplacées par les fiches techniques validées."], ["Comment retrouver ma réservation ?", "Utilisez votre référence et l'adresse email ou le téléphone fourni lors de la réservation."]];
  return <MobilityLayout><PageHeader eyebrow="Assistance" title="Questions fréquentes" description="L'essentiel pour préparer votre voyage ou votre demande." /><section><div className="mx-auto max-w-4xl px-4 py-12 sm:px-6"><div className="grid gap-3">{items.map(([question, answer]) => <details key={question} className="border border-black/10 bg-white p-5"><summary className="cursor-pointer font-bold">{question}</summary><p className="mt-3 leading-7 text-black/65">{answer}</p></details>)}</div></div></section></MobilityLayout>;
}

export { TripCard, BusCard };
