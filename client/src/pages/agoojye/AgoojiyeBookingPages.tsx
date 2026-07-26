import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCircle2, Download, Loader2, Printer, QrCode, Search, Smartphone, TicketCheck, Video, XCircle } from "lucide-react";
import { useLocation } from "wouter";

import { apiRequest } from "@/lib/queryClient";
import {
  ErrorState,
  LoadingState,
  MobilityLayout,
  PageHeader,
  clearBookingSession,
  formatDateTime,
  formatXof,
  getBookingSession,
  setBookingSession,
  trackMobilityEvent,
  useMobilityMeta,
  type MobilityBus,
  type MobilityRoute,
  type MobilityTrip,
  type PassengerInput,
} from "./mobility-core";

type TripPayload = {
  ok: boolean;
  trip: MobilityTrip;
  route: MobilityRoute;
  bus: MobilityBus;
  seats: Array<{ id: number; seatNumber: string; status: string; holdExpiresAt?: string | null }>;
  remainingSeats: number;
};

type BookingPayload = {
  booking: {
    booking: { id: number; reference: string; passengerCount: number; subtotalXof: number; feesXof: number; totalXof: number; currency: string; status: string; paymentStatus: string; holdExpiresAt?: string | null };
    trip: MobilityTrip;
    route: MobilityRoute;
    bus: MobilityBus;
    passengers: Array<{ id: number; firstName: string; lastName: string; phone?: string | null; email?: string | null; seatNumber?: string | null }>;
    tickets: Array<{ id: number; reference: string; publicToken: string; seatNumber?: string | null; status: string }>;
    payment?: { provider: string; method: string; status: string; demo: boolean } | null;
  };
};

function BookingSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = ["Choisir sa place", "Passagers", "Payer", "Recevoir son billet"];
  return <ol className="grid grid-cols-4 border-b border-black/10 bg-white" aria-label="Étapes de réservation">{steps.map((label, index) => <li key={label} className={`px-2 py-4 text-center text-xs font-bold sm:text-sm ${index + 1 === current ? "border-b-4 border-[#15803d] text-[#15803d]" : index + 1 < current ? "text-black" : "text-black/40"}`}><span className="mr-1 hidden sm:inline">{index + 1}.</span>{label}</li>)}</ol>;
}

function useCurrentTrip() {
  const session = getBookingSession();
  return useQuery<TripPayload>({
    queryKey: [`/api/agoojye/mobility/trips/${session.tripId || 0}`],
    queryFn: () => apiRequest(`/api/agoojye/mobility/trips/${session.tripId}`, "GET"),
    enabled: Boolean(session.tripId),
    refetchInterval: 30_000,
  });
}

export function AgoojiyeSeatSelectionPage() {
  useMobilityMeta("Choisir sa place", "Sélectionnez vos sièges pour le trajet AGOOJIYE.");
  const [, navigate] = useLocation();
  const session = getBookingSession();
  const trip = useCurrentTrip();
  const [selected, setSelected] = useState<string[]>(session.seatNumbers || []);
  const hold = useMutation({
    mutationFn: () => apiRequest("/api/agoojye/mobility/bookings/hold", "POST", { tripId: session.tripId, passengerCount: session.passengerCount, seatNumbers: selected }),
    onSuccess: (data) => {
      setBookingSession({ reference: data.booking.reference, accessToken: data.accessToken, seatNumbers: data.seatNumbers });
      trackMobilityEvent("booking_started", { tripId: session.tripId, seats: data.seatNumbers });
      navigate("/reservation/passagers");
    },
  });
  if (!session.tripId) return <MobilityLayout><ErrorState message="Choisissez d'abord un trajet." /><div className="pb-12 text-center"><a href="/reserver" className="font-bold text-[#15803d]">Rechercher un trajet</a></div></MobilityLayout>;
  if (trip.isLoading) return <MobilityLayout><BookingSteps current={1} /><LoadingState label="Chargement des places…" /></MobilityLayout>;
  if (trip.isError || !trip.data) return <MobilityLayout><BookingSteps current={1} /><ErrorState message={(trip.error as Error)?.message || "Trajet introuvable."} /></MobilityLayout>;
  const data = trip.data;
  const labels = data.bus.seatLayout?.labels?.length ? data.bus.seatLayout.labels : data.seats.map((seat) => seat.seatNumber);
  const stateBySeat = new Map(data.seats.map((seat) => [seat.seatNumber, seat]));
  const toggle = (seatNumber: string) => {
    const seat = stateBySeat.get(seatNumber);
    if (!seat || seat.status !== "available") return;
    setSelected((current) => {
      if (current.includes(seatNumber)) return current.filter((item) => item !== seatNumber);
      if (current.length >= session.passengerCount) return current;
      const next = [...current, seatNumber];
      trackMobilityEvent("seat_selected", { tripId: session.tripId, seatNumber });
      return next;
    });
  };
  return <MobilityLayout><BookingSteps current={1} /><section><div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_340px]"><div className="bg-white p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-[#15803d]">{data.route.origin} → {data.route.destination}</p><h1 className="mt-1 text-3xl font-bold">Choisissez {session.passengerCount} place{session.passengerCount > 1 ? "s" : ""}</h1></div><p className="text-sm text-black/55">{formatDateTime(data.trip.departureAt)}</p></div><div className="mx-auto mt-8 max-w-md"><div className="mb-5 bg-[#171917] px-4 py-3 text-center text-sm font-bold text-white">Avant du bus</div><div className="grid grid-cols-5 gap-2" role="group" aria-label="Plan des sièges">{labels.map((seatNumber, index) => { const seat = stateBySeat.get(seatNumber); const isSelected = selected.includes(seatNumber); const available = seat?.status === "available"; const aisle = index % 4 === 2; return <div key={seatNumber} className={aisle ? "col-start-4" : ""}><button type="button" onClick={() => toggle(seatNumber)} disabled={!available} aria-pressed={isSelected} aria-label={`Siège ${seatNumber}, ${isSelected ? "sélectionné" : available ? "disponible" : "indisponible"}`} className={`aspect-square w-full border text-sm font-bold transition-colors ${isSelected ? "border-[#15803d] bg-[#15803d] text-white" : available ? "border-black/20 bg-[#f5f3ee] hover:border-[#15803d]" : "cursor-not-allowed border-black/5 bg-black/10 text-black/25"}`}>{seatNumber}</button></div>; })}</div><div className="mt-6 flex flex-wrap gap-4 text-xs"><span className="flex items-center gap-2"><i className="h-4 w-4 border border-black/20 bg-[#f5f3ee]" />Disponible</span><span className="flex items-center gap-2"><i className="h-4 w-4 bg-[#15803d]" />Sélectionné</span><span className="flex items-center gap-2"><i className="h-4 w-4 bg-black/10" />Indisponible</span></div></div></div><aside className="h-fit bg-[#111412] p-6 text-white"><p className="text-sm text-white/60">Places sélectionnées</p><p className="mt-2 text-2xl font-bold">{selected.length ? selected.join(", ") : "Aucune"}</p><div className="mt-6 border-t border-white/15 pt-5"><p className="text-sm text-white/60">Total</p><p className="mt-1 text-3xl font-bold text-[#e0b84f]">{formatXof(data.trip.fareXof * session.passengerCount)}</p></div>{hold.isError ? <p className="mt-5 border border-red-400/50 bg-red-950/40 p-3 text-sm text-red-100" role="alert">{(hold.error as Error).message}</p> : null}<button type="button" onClick={() => hold.mutate()} disabled={selected.length !== session.passengerCount || hold.isPending} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 bg-[#d6a82e] px-4 font-bold text-[#111] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50">{hold.isPending ? <Loader2 className="animate-spin" size={18} /> : null}Continuer</button><a href={`/trajets/${data.trip.id}?passengers=${session.passengerCount}`} className="mt-4 flex items-center justify-center gap-2 text-sm text-white/65"><ArrowLeft size={16} />Retour au trajet</a></aside></div></section></MobilityLayout>;
}

function emptyPassenger(index: number): PassengerInput {
  return { firstName: "", lastName: "", phone: "", email: index === 0 ? "" : "", identificationReference: "", assistanceNote: "" };
}

export function AgoojiyePassengerPage() {
  useMobilityMeta("Informations passagers", "Renseignez les passagers de votre réservation AGOOJIYE.");
  const [, navigate] = useLocation();
  const session = getBookingSession();
  const [contactEmail, setContactEmail] = useState(session.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(session.contactPhone || "");
  const [passengers, setPassengers] = useState<PassengerInput[]>(session.passengers?.length === session.passengerCount ? session.passengers : Array.from({ length: session.passengerCount }, (_, index) => emptyPassenger(index)));
  const [usePrimaryContact, setUsePrimaryContact] = useState(
    !session.contactEmail ||
      !session.contactPhone ||
      (session.passengers?.[0]?.email === session.contactEmail && session.passengers?.[0]?.phone === session.contactPhone),
  );
  const resolvedContact = () => ({
    contactEmail: usePrimaryContact ? passengers[0]?.email || "" : contactEmail,
    contactPhone: usePrimaryContact ? passengers[0]?.phone || "" : contactPhone,
  });
  const save = useMutation({
    mutationFn: () => {
      const contact = resolvedContact();
      return apiRequest(`/api/agoojye/mobility/bookings/${session.reference}/passengers`, { method: "PUT", headers: { "x-booking-token": session.accessToken || "" }, body: JSON.stringify({ ...contact, passengers }) });
    },
    onSuccess: () => {
      setBookingSession({ ...resolvedContact(), passengers });
      navigate("/reservation/paiement");
    },
  });
  if (!session.reference || !session.accessToken) return <MobilityLayout><ErrorState message="Votre sélection de places n'est plus disponible. Recommencez la réservation." /></MobilityLayout>;
  const update = (index: number, field: keyof PassengerInput, value: string) => setPassengers((current) => current.map((passenger, passengerIndex) => passengerIndex === index ? { ...passenger, [field]: value } : passenger));
  const submit = (event: FormEvent) => { event.preventDefault(); save.mutate(); };
  return <MobilityLayout><BookingSteps current={2} /><section><form onSubmit={submit} aria-busy={save.isPending} className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_320px]"><div className="grid gap-5">{passengers.map((passenger, index) => <fieldset key={index} className="border border-black/10 bg-white p-5"><legend className="px-2 text-lg font-bold">Passager {index + 1} · siège {session.seatNumbers[index]}</legend><div className="mt-3 grid gap-4 sm:grid-cols-2"><Field label="Prénom" value={passenger.firstName} onChange={(value) => update(index, "firstName", value)} required /><Field label="Nom" value={passenger.lastName} onChange={(value) => update(index, "lastName", value)} required /><Field label={index === 0 ? "Téléphone du passager principal" : "Téléphone (facultatif)"} value={passenger.phone} onChange={(value) => update(index, "phone", value)} type="tel" required={index === 0} /><Field label={index === 0 ? "E-mail du passager principal" : "E-mail (facultatif)"} value={passenger.email} onChange={(value) => update(index, "email", value)} type="email" required={index === 0} /><Field label="Référence d'identification (facultatif)" value={passenger.identificationReference} onChange={(value) => update(index, "identificationReference", value)} /><label className="grid gap-1 text-sm font-semibold"><span>Besoin d'assistance (facultatif)</span><textarea value={passenger.assistanceNote} onChange={(event) => update(index, "assistanceNote", event.target.value)} className="min-h-24 border border-black/20 bg-white p-3 font-normal outline-none focus:border-[#15803d]" /></label></div></fieldset>)}</div><aside className="h-fit bg-[#111412] p-6 text-white lg:sticky lg:top-24"><h2 className="text-xl font-bold">Contact de réservation</h2><label className="mt-5 flex min-h-12 cursor-pointer items-start gap-3 border border-white/20 p-3 text-sm"><input type="checkbox" checked={usePrimaryContact} onChange={(event) => setUsePrimaryContact(event.target.checked)} className="mt-1 h-4 w-4" /><span><strong className="block">Utiliser le contact du passager principal</strong><span className="mt-1 block text-xs leading-5 text-white/55">Recommandé pour recevoir la confirmation sans ressaisir vos coordonnées.</span></span></label>{usePrimaryContact ? <div className="mt-4 border-l-2 border-[#d6a82e] pl-3 text-sm text-white/70" aria-live="polite"><p>{passengers[0]?.email || "E-mail à renseigner ci-dessus"}</p><p className="mt-1">{passengers[0]?.phone || "Téléphone à renseigner ci-dessus"}</p></div> : <div className="mt-5 grid gap-4"><DarkField label="E-mail du contact" type="email" value={contactEmail} onChange={setContactEmail} required /><DarkField label="Téléphone du contact" type="tel" value={contactPhone} onChange={setContactPhone} required /></div>}{save.isError ? <p className="mt-4 text-sm text-red-300" role="alert">{(save.error as Error).message}</p> : null}<button type="submit" disabled={save.isPending} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 bg-[#d6a82e] px-4 font-bold text-[#111] disabled:opacity-50">{save.isPending ? <Loader2 className="animate-spin" size={18} /> : null}{save.isPending ? "Enregistrement…" : "Voir le récapitulatif"}</button><p className="mt-4 text-xs leading-5 text-white/50">Ces informations servent uniquement à la réservation, au billet et à l'assistance voyage.</p></aside></form></section></MobilityLayout>;
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="grid gap-1 text-sm font-semibold"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="h-12 border border-black/20 bg-white px-3 font-normal outline-none focus:border-[#15803d]" /></label>;
}

function DarkField(props: Parameters<typeof Field>[0]) {
  return <label className="grid gap-1 text-sm font-semibold"><span>{props.label}</span><input type={props.type || "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} required={props.required} className="h-12 border border-white/20 bg-white/5 px-3 font-normal text-white outline-none focus:border-[#e0b84f]" /></label>;
}

function useBookingPayload() {
  const session = getBookingSession();
  return useQuery<BookingPayload>({ queryKey: [`/api/agoojye/mobility/bookings/${session.reference || "none"}`, session.accessToken], queryFn: () => apiRequest(`/api/agoojye/mobility/bookings/${session.reference}`, { headers: { "x-booking-token": session.accessToken || "" } }), enabled: Boolean(session.reference && session.accessToken), refetchInterval: 20_000 });
}

export function AgoojiyePaymentPage() {
  useMobilityMeta("Paiement", "Confirmez votre réservation AGOOJIYE avec le fournisseur de paiement de démonstration.");
  const [, navigate] = useLocation();
  const session = getBookingSession();
  const booking = useBookingPayload();
  const [method, setMethod] = useState("mobile_money");
  const [outcome, setOutcome] = useState("success");
  const pay = useMutation({ mutationFn: () => apiRequest(`/api/agoojye/mobility/bookings/${session.reference}/payment`, { method: "POST", headers: { "x-booking-token": session.accessToken || "" }, body: JSON.stringify({ method, demoOutcome: outcome }) }), onSuccess: (data) => { if (data.paymentStatus === "paid") { trackMobilityEvent("payment_completed", { reference: session.reference, demo: true }); navigate(`/reservation/confirmation/${session.reference}`); } else booking.refetch(); } });
  if (!session.reference || !session.accessToken) return <MobilityLayout><ErrorState message="Réservation absente ou expirée." /></MobilityLayout>;
  if (booking.isLoading) return <MobilityLayout><BookingSteps current={3} /><LoadingState label="Chargement du récapitulatif…" /></MobilityLayout>;
  if (booking.isError || !booking.data) return <MobilityLayout><BookingSteps current={3} /><ErrorState message={(booking.error as Error)?.message || "Réservation introuvable."} /></MobilityLayout>;
  const data = booking.data.booking;
  return <MobilityLayout><BookingSteps current={3} /><section><div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px]"><div className="bg-white p-6"><h1 className="text-3xl font-bold">Récapitulatif</h1><p className="mt-2 text-sm text-black/55">Référence {data.booking.reference}</p><div className="mt-6 border-y border-black/10 py-5"><h2 className="text-xl font-bold">{data.route.origin} → {data.route.destination}</h2><p className="mt-2 text-black/65">{formatDateTime(data.trip.departureAt)} · {data.route.boardingPoint}</p><p className="mt-1 text-black/65">{data.bus.name} · sièges {data.passengers.map((passenger) => passenger.seatNumber).join(", ")}</p></div><div className="mt-6"><h2 className="font-bold">Passagers</h2><ul className="mt-3 grid gap-2">{data.passengers.map((passenger) => <li key={passenger.id} className="flex justify-between border-b border-black/10 pb-2 text-sm"><span>{passenger.firstName} {passenger.lastName}</span><span className="font-bold">{passenger.seatNumber}</span></li>)}</ul></div><dl className="mt-6 grid gap-2 text-sm"><div className="flex justify-between"><dt>Sous-total</dt><dd>{formatXof(data.booking.subtotalXof)}</dd></div><div className="flex justify-between"><dt>Frais</dt><dd>{formatXof(data.booking.feesXof)}</dd></div><div className="flex justify-between border-t border-black/10 pt-3 text-lg font-bold"><dt>Total</dt><dd>{formatXof(data.booking.totalXof)}</dd></div></dl></div><aside className="h-fit bg-[#111412] p-6 text-white"><div className="border border-[#e0b84f]/50 bg-[#e0b84f]/10 p-4"><p className="font-bold text-[#edc75f]">Paiement de démonstration</p><p className="mt-2 text-xs leading-5 text-white/65">Aucun débit réel. Utilisez ces options pour tester les états succès, attente et échec.</p></div><fieldset className="mt-6"><legend className="font-bold">Mode de paiement</legend><div className="mt-3 grid gap-2">{[["mobile_money", "Mobile Money"], ["card", "Carte bancaire"], ["bank_transfer", "Virement"], ["cash", "Espèces au guichet"]].map(([value, label]) => <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 border px-3 ${method === value ? "border-[#e0b84f] bg-white/10" : "border-white/15"}`}><input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} />{label}</label>)}</div></fieldset><label className="mt-5 grid gap-1 text-sm font-semibold"><span>Résultat simulé</span><select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="h-12 border border-white/20 bg-[#202421] px-3 text-white"><option value="success">Paiement confirmé</option><option value="pending">Paiement en attente</option><option value="failed">Paiement échoué</option></select></label>{pay.isError ? <p className="mt-4 text-sm text-red-300" role="alert">{(pay.error as Error).message}</p> : null}{data.booking.paymentStatus === "pending" ? <p className="mt-4 border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">Paiement en attente. La réservation reste temporairement bloquée.</p> : null}<button type="button" onClick={() => { trackMobilityEvent("payment_started", { method, demo: true }); pay.mutate(); }} disabled={pay.isPending} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 bg-[#d6a82e] px-4 font-bold text-[#111] disabled:opacity-50">{pay.isPending ? <Loader2 className="animate-spin" size={18} /> : <Smartphone size={18} />}{pay.isPending ? "Traitement…" : "Simuler le paiement"}</button></aside></div></section></MobilityLayout>;
}

export function AgoojiyeConfirmationPage({ reference }: { reference: string }) {
  useMobilityMeta("Réservation confirmée", "Votre réservation et vos billets numériques AGOOJIYE.");
  const session = getBookingSession();
  const booking = useQuery<BookingPayload>({ queryKey: [`/api/agoojye/mobility/bookings/${reference}`, session.accessToken], queryFn: () => apiRequest(`/api/agoojye/mobility/bookings/${reference}`, { headers: { "x-booking-token": session.accessToken || "" } }), enabled: Boolean(session.accessToken), refetchOnMount: "always" });
  if (!session.accessToken) return <MobilityLayout><ErrorState message="Utilisez la page « Retrouver ma réservation » avec votre référence et votre contact." /></MobilityLayout>;
  if (booking.isLoading) return <MobilityLayout><BookingSteps current={4} /><LoadingState /></MobilityLayout>;
  if (!booking.data) return <MobilityLayout><ErrorState message={(booking.error as Error)?.message || "Réservation introuvable."} /></MobilityLayout>;
  const data = booking.data.booking;
  return <MobilityLayout><BookingSteps current={4} /><section><div className="mx-auto max-w-5xl px-4 py-12 sm:px-6"><div className="border border-[#15803d]/30 bg-[#edf8f0] p-6"><CheckCircle2 className="text-[#15803d]" size={36} /><h1 className="mt-4 text-4xl font-bold">Réservation confirmée</h1><p className="mt-2 text-black/65">Référence <strong>{data.booking.reference}</strong> · Paiement confirmé en mode démonstration.</p></div><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]"><div className="bg-white p-6"><h2 className="text-2xl font-bold">Votre voyage</h2><p className="mt-4 text-xl font-bold">{data.route.origin} → {data.route.destination}</p><p className="mt-2 text-black/65">{formatDateTime(data.trip.departureAt)}</p><p className="mt-1 text-black/65">Embarquement: {data.route.boardingPoint}</p><p className="mt-1 text-black/65">Bus: {data.bus.name} · {data.bus.reference}</p><h3 className="mt-6 font-bold">Billets</h3><div className="mt-3 grid gap-3">{data.tickets.map((ticket, index) => <a key={ticket.id} href={`/billet/${ticket.publicToken}`} className="flex min-h-14 items-center justify-between border border-black/10 px-4 hover:border-[#15803d]"><span><strong>{data.passengers[index]?.firstName} {data.passengers[index]?.lastName}</strong><small className="block text-black/50">Siège {ticket.seatNumber} · {ticket.reference}</small></span><QrCode size={24} /></a>)}</div></div><aside className="bg-[#111412] p-6 text-white"><h2 className="text-xl font-bold">À présenter à l'embarquement</h2><p className="mt-3 text-sm leading-6 text-white/65">Ouvrez chaque billet sur votre téléphone ou utilisez la fonction d'impression. Le contrôleur scannera le QR code unique.</p><div className="mt-6 grid gap-3"><button type="button" onClick={() => window.print()} className="flex min-h-11 items-center justify-center gap-2 border border-white/25 px-4 font-bold"><Printer size={18} />Imprimer</button><a href="/retrouver-ma-reservation" className="flex min-h-11 items-center justify-center border border-white/25 px-4 font-bold">Retrouver plus tard</a><a href="/" onClick={() => clearBookingSession()} className="flex min-h-11 items-center justify-center bg-[#d6a82e] px-4 font-bold text-[#111]">Terminer</a></div><p className="mt-6 text-xs leading-5 text-white/50">Pour une modification ou une annulation, contactez support@agoojiye.com en indiquant votre référence.</p></aside></div></div></section></MobilityLayout>;
}

export function AgoojiyeTicketPage({ token }: { token: string }) {
  useMobilityMeta("Billet numérique", "Billet numérique sécurisé AGOOJIYE.");
  const ticket = useQuery<any>({ queryKey: [`/api/agoojye/mobility/tickets/${token}`], queryFn: () => apiRequest(`/api/agoojye/mobility/tickets/${token}`, "GET") });
  if (ticket.isLoading) return <MobilityLayout><LoadingState label="Chargement du billet…" /></MobilityLayout>;
  if (ticket.isError || !ticket.data) return <MobilityLayout><ErrorState message={(ticket.error as Error)?.message || "Billet introuvable."} /></MobilityLayout>;
  const data = ticket.data;
  const statusLabel: Record<string, string> = { active: "Actif", used: "Déjà utilisé", cancelled: "Annulé", expired: "Expiré", invalid: "Invalide" };
  const paymentLabel: Record<string, string> = { unpaid: "Non payé", pending: "En attente", paid: "Confirmé", failed: "Échoué", refunded: "Remboursé" };
  const paymentTone = data.booking.paymentStatus === "paid" ? "text-[#15803d]" : data.booking.paymentStatus === "pending" ? "text-amber-700" : "text-red-700";
  return <MobilityLayout><section className="bg-[#e7e3da] print:bg-white"><div className="mx-auto max-w-xl px-4 py-10"><article className="overflow-hidden border border-black/15 bg-white shadow-xl print:shadow-none"><header className="flex items-center justify-between bg-[#0b0d0c] p-5 text-white"><img src="/brand/agoojiye/logo/AGOOJIYE_wordmark_gold_transparent.png" alt="AGOOJIYE" width={1109} height={201} className="h-8 w-auto" /><span className="border border-[#e0b84f]/60 px-3 py-1 text-xs font-bold text-[#e0b84f]">{statusLabel[data.ticket.status] || data.ticket.status}</span></header><div className="p-6"><p className="text-xs font-bold uppercase text-[#805f12]">Billet {data.ticket.reference}</p><h1 className="mt-2 text-3xl font-bold">{data.route.origin} → {data.route.destination}</h1><div className="mt-6 grid grid-cols-2 gap-5 text-sm"><div><p className="text-black/50">Passager</p><p className="mt-1 font-bold">{data.passenger.firstName} {data.passenger.lastName}</p></div><div><p className="text-black/50">Siège</p><p className="mt-1 text-2xl font-bold">{data.ticket.seatNumber || "Auto"}</p></div><div><p className="text-black/50">Départ</p><p className="mt-1 font-bold">{formatDateTime(data.trip.departureAt)}</p></div><div><p className="text-black/50">Embarquement</p><p className="mt-1 font-bold">{data.route.boardingPoint}</p></div><div><p className="text-black/50">Bus</p><p className="mt-1 font-bold">{data.bus.name}</p></div><div><p className="text-black/50">Paiement</p><p className={`mt-1 font-bold ${paymentTone}`}>{paymentLabel[data.booking.paymentStatus] || data.booking.paymentStatus}</p></div></div><div className="mt-6 border-t border-dashed border-black/25 pt-6 text-center"><img src={`/api/agoojye/mobility/tickets/${token}/qr`} alt={`QR code du billet ${data.ticket.reference}`} width={260} height={260} className="mx-auto h-56 w-56" /><p className="mt-3 text-xs text-black/50">Présentez ce code au contrôleur. Ne le partagez pas.</p></div></div></article><div className="mt-5 flex gap-3 print:hidden"><button type="button" onClick={() => { trackMobilityEvent("ticket_downloaded", { ticket: data.ticket.reference }); window.print(); }} className="flex min-h-11 flex-1 items-center justify-center gap-2 bg-[#171917] px-4 font-bold text-white"><Download size={18} />Télécharger / imprimer</button></div></div></section></MobilityLayout>;
}

export function AgoojiyeBookingLookupPage() {
  useMobilityMeta("Retrouver ma réservation", "Retrouvez une réservation AGOOJIYE avec sa référence et votre contact.");
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const lookup = useMutation<BookingPayload, Error>({ mutationFn: () => apiRequest(`/api/agoojye/mobility/bookings/${encodeURIComponent(reference.trim().toUpperCase())}?contact=${encodeURIComponent(contact.trim().toLowerCase())}`, "GET") });
  const submit = (event: FormEvent) => { event.preventDefault(); lookup.mutate(); };
  const data = lookup.data?.booking;
  const bookingStatus: Record<string, string> = { hold: "Places maintenues", pending: "En attente", pending_payment: "Paiement en attente", payment_failed: "Paiement échoué", confirmed: "Confirmée", cancelled: "Annulée", expired: "Expirée", completed: "Terminée" };
  const paymentStatus: Record<string, string> = { unpaid: "Non payé", pending: "En attente", paid: "Confirmé", failed: "Échoué", refunded: "Remboursé" };
  const bookingTone = data && ["confirmed", "completed"].includes(data.booking.status)
    ? "border-[#15803d]/30 bg-green-50 text-[#15803d]"
    : data && ["cancelled", "expired", "payment_failed"].includes(data.booking.status)
      ? "border-red-300 bg-red-50 text-red-700"
      : "border-amber-300 bg-amber-50 text-amber-800";
  const cancellationHref = data ? `mailto:support@agoojiye.com?subject=${encodeURIComponent(`Demande d'annulation ${data.booking.reference}`)}&body=${encodeURIComponent(`Bonjour,\n\nJe souhaite demander l'annulation de la réservation ${data.booking.reference}.\n\nMerci de me confirmer les conditions applicables.`)}` : "#";
  return <MobilityLayout><PageHeader eyebrow="Billetterie" title="Retrouver ma réservation" description="Saisissez la référence reçue lors de la réservation et votre téléphone ou votre e-mail." /><section><div className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><form onSubmit={submit} aria-busy={lookup.isPending} className="grid gap-4 bg-white p-6 sm:grid-cols-[1fr_1fr_auto]"><Field label="Référence" value={reference} onChange={setReference} required /><Field label="Téléphone ou e-mail" value={contact} onChange={setContact} required /><button type="submit" disabled={lookup.isPending} className="mt-auto flex min-h-12 items-center justify-center gap-2 bg-[#171917] px-4 font-bold text-white disabled:opacity-60">{lookup.isPending ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}{lookup.isPending ? "Recherche…" : "Rechercher"}</button></form>{lookup.isError ? <ErrorState message={lookup.error.message} /> : null}{data ? <div className="mt-6 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-black/50">Référence {data.booking.reference}</p><h2 className="mt-1 text-2xl font-bold">{data.route.origin} → {data.route.destination}</h2><p className="mt-2 text-black/65">{formatDateTime(data.trip.departureAt)}</p></div><span className={`border px-3 py-2 text-sm font-bold ${bookingTone}`}>{bookingStatus[data.booking.status] || data.booking.status}</span></div><div className="mt-5 grid gap-3">{data.tickets.map((ticket, index) => <a key={ticket.id} href={`/billet/${ticket.publicToken}`} className="flex min-h-14 items-center justify-between border border-black/10 px-4 hover:border-[#15803d]"><span>{data.passengers[index]?.firstName} {data.passengers[index]?.lastName} · siège {ticket.seatNumber}</span><QrCode size={22} /></a>)}</div>{!data.tickets.length ? <p className="mt-5 border border-amber-200 bg-amber-50 p-4 text-sm">Aucun billet n'est encore disponible. Statut du paiement: {paymentStatus[data.booking.paymentStatus] || data.booking.paymentStatus}.</p> : null}<div className="mt-6 flex flex-col gap-3 border-t border-black/10 pt-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Besoin de modifier ou d'annuler ?</p><p className="mt-1 text-xs text-black/50">L'équipe confirme l'éligibilité et les éventuels frais avant toute annulation.</p></div><a href={cancellationHref} className="inline-flex min-h-11 shrink-0 items-center justify-center border border-black/20 px-4 text-sm font-bold hover:border-[#15803d]">Demander une annulation</a></div></div> : null}</div></section></MobilityLayout>;
}

type StaffTrip = { trip: MobilityTrip; route: MobilityRoute; bus: MobilityBus };

export function AgoojiyeControllerPage() {
  useMobilityMeta("Contrôle embarquement", "Interface protégée de validation des billets AGOOJIYE.");
  const trips = useQuery<{ trips: StaffTrip[] }>({ queryKey: ["/api/agoojye/staff/trips/today"], queryFn: () => apiRequest("/api/agoojye/staff/trips/today", "GET") });
  const [tripId, setTripId] = useState(0);
  const [code, setCode] = useState("");
  const [manifestSearch, setManifestSearch] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => { if (!tripId && trips.data?.trips[0]) setTripId(trips.data.trips[0].trip.id); }, [tripId, trips.data]);
  const manifest = useQuery<any>({ queryKey: [`/api/agoojye/staff/trips/${tripId}/manifest`], queryFn: () => apiRequest(`/api/agoojye/staff/trips/${tripId}/manifest`, "GET"), enabled: Boolean(tripId) });
  const validate = useMutation<any, Error, string>({ mutationFn: (token) => apiRequest("/api/agoojye/staff/tickets/validate", "POST", { token, tripId, deviceMetadata: { userAgent: navigator.userAgent, online: navigator.onLine } }), onSuccess: () => { setCode(""); manifest.refetch(); } });
  const stopCamera = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; setCameraActive(false); };
  const validateTicket = (token: string) => {
    validate.reset();
    validate.mutate(token);
  };
  useEffect(() => stopCamera, []);
  const startCamera = async () => {
    setCameraError("");
    try {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) throw new Error("La lecture QR automatique n'est pas prise en charge par ce navigateur. Utilisez la saisie manuelle.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          const raw = found[0]?.rawValue;
          if (raw) {
            const token = raw.includes("/billet/") ? raw.split("/billet/").pop() : raw;
            stopCamera();
            validateTicket(String(token));
            return;
          }
        } catch {
          // Keep scanning while the camera is active.
        }
        window.setTimeout(scan, 450);
      };
      scan();
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Accès caméra refusé.");
      stopCamera();
    }
  };
  const ticketStatus: Record<string, string> = { active: "Actif", used: "Déjà utilisé", cancelled: "Annulé", expired: "Expiré", invalid: "Invalide" };
  const normalizedSearch = manifestSearch.trim().toLowerCase();
  const visibleManifest = (manifest.data?.manifest || []).filter((row: any) => {
    if (!normalizedSearch) return true;
    return `${row.passenger.firstName} ${row.passenger.lastName} ${row.booking.reference} ${row.ticket.reference}`.toLowerCase().includes(normalizedSearch);
  });
  return <MobilityLayout><PageHeader eyebrow="Espace contrôleur" title="Contrôle d'embarquement" description="Scannez ou saisissez un billet. Une seconde validation du même billet est refusée." /><section><div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[360px_1fr]"><aside className="h-fit bg-[#111412] p-5 text-white"><label className="grid gap-2 text-sm font-bold"><span>Trajet du jour</span><select value={tripId} onChange={(event) => { stopCamera(); validate.reset(); setTripId(Number(event.target.value)); }} disabled={trips.isLoading || !trips.data?.trips.length} className="h-12 border border-white/20 bg-[#202421] px-3 disabled:opacity-60">{trips.isLoading ? <option>Chargement des trajets…</option> : null}{trips.data?.trips.map((row) => <option key={row.trip.id} value={row.trip.id}>{formatDateTime(row.trip.departureAt)} · {row.route.origin} → {row.route.destination}</option>)}</select></label>{trips.isError ? <p className="mt-3 text-sm text-red-300" role="alert">Impossible de charger les trajets. Réessayez.</p> : null}{!trips.isLoading && !trips.data?.trips.length ? <p className="mt-3 border border-amber-300/40 bg-amber-950/30 p-3 text-sm text-amber-100">Aucun trajet à contrôler aujourd'hui.</p> : null}<video ref={videoRef} muted playsInline className={`${cameraActive ? "mt-5 block" : "hidden"} aspect-square w-full bg-black object-cover`} /><button type="button" onClick={cameraActive ? stopCamera : startCamera} disabled={!tripId} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 border border-white/25 px-4 font-bold disabled:opacity-50"><Video size={18} />{cameraActive ? "Fermer la caméra" : "Scanner un QR code"}</button>{cameraError ? <p className="mt-3 text-sm text-amber-200" role="alert">{cameraError}</p> : null}<div className="my-5 flex items-center gap-3 text-xs text-white/40"><span className="h-px flex-1 bg-white/15" />ou<span className="h-px flex-1 bg-white/15" /></div><form onSubmit={(event) => { event.preventDefault(); if (code.trim()) validateTicket(code.trim()); }}><label className="grid gap-2 text-sm font-bold"><span>Code du billet</span><input value={code} onChange={(event) => { setCode(event.target.value); if (validate.data || validate.error) validate.reset(); }} className="h-12 border border-white/20 bg-white/5 px-3 uppercase" placeholder="TKT-… ou jeton" /></label><button type="submit" disabled={!code.trim() || validate.isPending || !tripId} className="mt-3 min-h-12 w-full bg-[#d6a82e] px-4 font-bold text-[#111] disabled:opacity-50">{validate.isPending ? "Vérification…" : "Valider le billet"}</button></form>{validate.data ? <div className={`mt-5 border p-4 ${validate.data.ok ? "border-green-400 bg-green-950/50 text-green-100" : "border-red-400 bg-red-950/50 text-red-100"}`} role="status">{validate.data.ok ? <CheckCircle2 size={28} /> : <XCircle size={28} />}<p className="mt-2 text-lg font-bold">{validate.data.message}</p></div> : null}{validate.isError ? <p className="mt-5 border border-red-400 bg-red-950/50 p-4 text-sm text-red-100">{validate.error.message}</p> : null}</aside><div className="bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">Manifeste passagers</h2>{tripId ? <a href={`/api/agoojye/staff/trips/${tripId}/manifest`} className="text-sm font-bold text-[#15803d]">Télécharger l'instantané</a> : null}</div><p className="mt-2 text-sm text-black/50">Instantané cacheable pour consultation limitée en cas de réseau instable. La validation reste en ligne.</p><label className="mt-5 grid gap-1 text-sm font-semibold"><span>Rechercher un passager ou une référence</span><input type="search" value={manifestSearch} onChange={(event) => setManifestSearch(event.target.value)} disabled={!tripId} className="h-12 border border-black/20 px-3 disabled:bg-black/5" placeholder="Nom, réservation ou billet" /></label>{manifest.isLoading ? <LoadingState /> : manifest.isError ? <ErrorState message="Le manifeste n'est pas disponible. Vérifiez votre connexion puis réessayez." onRetry={() => manifest.refetch()} /> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-black/15"><th className="p-3">Passager</th><th className="p-3">Réservation</th><th className="p-3">Siège</th><th className="p-3">Billet</th><th className="p-3">Statut</th></tr></thead><tbody>{visibleManifest.map((row: any) => <tr key={row.ticket.id} className="border-b border-black/10"><td className="p-3 font-semibold">{row.passenger.firstName} {row.passenger.lastName}</td><td className="p-3">{row.booking.reference}</td><td className="p-3 font-bold">{row.ticket.seatNumber}</td><td className="p-3">{row.ticket.reference}</td><td className="p-3">{ticketStatus[row.ticket.status] || row.ticket.status}</td></tr>)}</tbody></table>{!visibleManifest.length ? <p className="p-6 text-center text-sm text-black/50">{normalizedSearch ? "Aucun passager ne correspond à cette recherche." : "Aucun passager n'est encore enregistré sur ce trajet."}</p> : null}</div>}</div></div></section></MobilityLayout>;
}
