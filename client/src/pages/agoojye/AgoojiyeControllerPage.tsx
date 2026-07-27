import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  Loader2,
  Search,
  TicketCheck,
  Video,
} from "lucide-react";

import { ApiError, apiRequest } from "@/lib/queryClient";
import {
  ErrorState,
  LoadingState,
  MobilityLayout,
  PageHeader,
  formatDateTime,
  useMobilityMeta,
  type MobilityBus,
  type MobilityRoute,
  type MobilityTrip,
} from "./mobility-core";

type StaffTrip = {
  trip: MobilityTrip;
  route: MobilityRoute;
  bus: MobilityBus;
};

type ManifestRow = {
  ticket: {
    id: number;
    reference: string;
    seatNumber?: string | null;
    status: string;
  };
  passenger: {
    firstName: string;
    lastName: string;
  };
  booking: {
    reference: string;
  };
};

const ticketStatus: Record<string, string> = {
  active: "Actif",
  used: "Déjà utilisé",
  cancelled: "Annulé",
  expired: "Expiré",
  invalid: "Invalide",
};

export default function AgoojiyeControllerPage() {
  useMobilityMeta(
    "Contrôle embarquement",
    "Interface protégée de validation des billets AGOOJIYE.",
  );
  const trips = useQuery<{ trips: StaffTrip[] }>({
    queryKey: ["/api/agoojye/staff/trips/today"],
    queryFn: () => apiRequest("/api/agoojye/staff/trips/today", "GET"),
  });
  const [tripId, setTripId] = useState(0);
  const [code, setCode] = useState("");
  const [manifestSearch, setManifestSearch] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!tripId && trips.data?.trips[0]) setTripId(trips.data.trips[0].trip.id);
  }, [tripId, trips.data]);

  const manifest = useQuery<{ manifest: ManifestRow[] }>({
    queryKey: [`/api/agoojye/staff/trips/${tripId}/manifest`],
    queryFn: () => apiRequest(`/api/agoojye/staff/trips/${tripId}/manifest`, "GET"),
    enabled: Boolean(tripId),
  });

  const validate = useMutation<any, Error, string>({
    mutationFn: (token) =>
      apiRequest("/api/agoojye/staff/tickets/validate", "POST", {
        token,
        tripId,
        deviceMetadata: {
          userAgent: navigator.userAgent,
          online: navigator.onLine,
        },
      }),
    onSuccess: () => {
      setCode("");
      manifest.refetch();
    },
  });

  const downloadManifest = useMutation({
    mutationFn: () => apiRequest(`/api/agoojye/staff/trips/${tripId}/manifest`, "GET"),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `manifest-agoojiye-trajet-${tripId}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    },
  });

  const stopCamera = () => {
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const validateTicket = (token: string) => {
    validate.reset();
    validate.mutate(token);
  };

  useEffect(() => stopCamera, []);

  const startCamera = async () => {
    setCameraError("");
    try {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) {
        throw new Error(
          "La lecture QR automatique n'est pas prise en charge par ce navigateur. Utilisez la saisie manuelle.",
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (!videoRef.current) {
        stopCamera();
        return;
      }
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
          // Continue while the camera stream remains active.
        }
        scanTimerRef.current = window.setTimeout(scan, 450);
      };
      await scan();
    } catch (error) {
      setCameraError(
        error instanceof Error ? error.message : "L'accès à la caméra a été refusé.",
      );
      stopCamera();
    }
  };

  const normalizedSearch = manifestSearch.trim().toLowerCase();
  const visibleManifest = (manifest.data?.manifest || []).filter((row) => {
    if (!normalizedSearch) return true;
    return [
      row.passenger.firstName,
      row.passenger.lastName,
      row.booking.reference,
      row.ticket.reference,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });

  const tripApiError = trips.error instanceof ApiError ? trips.error : null;
  if (tripApiError && (tripApiError.status === 401 || tripApiError.status === 403)) {
    const signedOut = tripApiError.status === 401;
    return (
      <MobilityLayout>
        <section className="grid min-h-[65vh] place-items-center px-4 py-12">
          <div className="max-w-lg border border-black/10 bg-white p-7 text-center">
            <TicketCheck className="mx-auto h-10 w-10 text-[#805f12]" />
            <p className="mt-5 text-xs font-bold uppercase text-[#805f12]">Espace réservé</p>
            <h1 className="mt-2 text-3xl font-bold">Accès au contrôle refusé</h1>
            <p className="mt-3 text-sm leading-6 text-black/60">
              {signedOut
                ? "Connectez-vous avec un compte contrôleur ou administrateur AGOOJIYE."
                : "Votre compte ne possède pas le rôle nécessaire pour contrôler les billets."}
            </p>
            <a
              href={signedOut ? "/workspace/connexion" : "/workspace"}
              className="mt-6 inline-flex min-h-12 items-center justify-center bg-[#171917] px-5 font-bold text-white"
            >
              {signedOut ? "Se connecter" : "Revenir à mon espace"}
            </a>
          </div>
        </section>
      </MobilityLayout>
    );
  }

  return (
    <MobilityLayout>
      <PageHeader
        eyebrow="Espace contrôleur"
        title="Contrôle d'embarquement"
        description="Scannez ou saisissez un billet. Une seconde validation du même billet est refusée."
      />
      <section>
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[360px_1fr]">
          <aside className="h-fit bg-[#111412] p-5 text-white">
            <label className="grid gap-2 text-sm font-bold">
              <span>Trajet du jour</span>
              <select
                value={tripId}
                onChange={(event) => {
                  stopCamera();
                  validate.reset();
                  setTripId(Number(event.target.value));
                }}
                disabled={trips.isLoading || !trips.data?.trips.length}
                className="h-12 border border-white/20 bg-[#202421] px-3 disabled:opacity-60"
              >
                {trips.isLoading ? <option>Chargement des trajets…</option> : null}
                {trips.data?.trips.map((row) => (
                  <option key={row.trip.id} value={row.trip.id}>
                    {formatDateTime(row.trip.departureAt)} · {row.route.origin} →{" "}
                    {row.route.destination}
                  </option>
                ))}
              </select>
            </label>
            {trips.isError ? (
              <p className="mt-3 text-sm text-red-300" role="alert">
                Impossible de charger les trajets. Réessayez.
              </p>
            ) : null}
            {!trips.isLoading && !trips.data?.trips.length ? (
              <p className="mt-3 border border-amber-300/40 bg-amber-950/30 p-3 text-sm text-amber-100">
                Aucun trajet à contrôler aujourd'hui.
              </p>
            ) : null}

            <video
              ref={videoRef}
              muted
              playsInline
              className={`${cameraActive ? "mt-5 block" : "hidden"} aspect-square w-full bg-black object-cover`}
            />
            <button
              type="button"
              onClick={cameraActive ? stopCamera : startCamera}
              disabled={!tripId}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 border border-white/25 px-4 font-bold disabled:opacity-50"
            >
              <Video size={18} />
              {cameraActive ? "Fermer la caméra" : "Scanner un QR code"}
            </button>
            {cameraError ? (
              <p className="mt-3 text-sm text-amber-200" role="alert">
                {cameraError}
              </p>
            ) : null}

            <div className="my-5 flex items-center gap-3 text-xs text-white/40">
              <span className="h-px flex-1 bg-white/15" />
              ou
              <span className="h-px flex-1 bg-white/15" />
            </div>
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (code.trim()) validateTicket(code.trim());
              }}
            >
              <label className="grid gap-2 text-sm font-bold">
                <span>Code du billet</span>
                <input
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    if (validate.data || validate.error) validate.reset();
                  }}
                  className="h-12 border border-white/20 bg-white/5 px-3 uppercase"
                  placeholder="TKT-… ou jeton"
                />
              </label>
              <button
                type="submit"
                disabled={!code.trim() || validate.isPending || !tripId}
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 bg-[#d6a82e] px-4 font-bold text-[#111] disabled:opacity-50"
              >
                {validate.isPending ? <Loader2 className="animate-spin" size={18} /> : null}
                {validate.isPending ? "Vérification…" : "Valider le billet"}
              </button>
            </form>
            {validate.data ? (
              <div
                className="mt-5 border border-green-400 bg-green-950/50 p-4 text-green-100"
                role="status"
              >
                <CheckCircle2 size={28} />
                <p className="mt-2 text-lg font-bold">{validate.data.message}</p>
              </div>
            ) : null}
            {validate.isError ? (
              <p
                className="mt-5 border border-red-400 bg-red-950/50 p-4 text-sm text-red-100"
                role="alert"
              >
                {validate.error.message}
              </p>
            ) : null}
          </aside>

          <div className="min-w-0 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">Manifeste passagers</h2>
              {tripId ? (
                <button
                  type="button"
                  onClick={() => downloadManifest.mutate()}
                  disabled={downloadManifest.isPending}
                  className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#15803d] disabled:opacity-50"
                >
                  <Download size={16} />
                  {downloadManifest.isPending ? "Préparation…" : "Télécharger l'instantané"}
                </button>
              ) : null}
            </div>
            {downloadManifest.isError ? (
              <p className="mt-2 text-sm text-red-700" role="alert">
                Le téléchargement du manifeste a échoué. Réessayez.
              </p>
            ) : null}
            <p className="mt-2 text-sm text-black/50">
              Instantané cacheable pour consultation limitée en cas de réseau instable. La
              validation reste en ligne.
            </p>
            <label className="mt-5 grid gap-1 text-sm font-semibold">
              <span>Rechercher un passager ou une référence</span>
              <span className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-black/35"
                  size={18}
                />
                <input
                  type="search"
                  value={manifestSearch}
                  onChange={(event) => setManifestSearch(event.target.value)}
                  disabled={!tripId}
                  className="h-12 w-full border border-black/20 pl-10 pr-3 disabled:bg-black/5"
                  placeholder="Nom, réservation ou billet"
                />
              </span>
            </label>

            {manifest.isLoading ? (
              <LoadingState />
            ) : manifest.isError ? (
              <ErrorState
                message="Le manifeste n'est pas disponible. Vérifiez votre connexion puis réessayez."
                onRetry={() => manifest.refetch()}
              />
            ) : (
              <>
                <div className="mt-5 grid gap-3 md:hidden">
                  {visibleManifest.map((row) => (
                    <article key={row.ticket.id} className="border border-black/10 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">
                            {row.passenger.firstName} {row.passenger.lastName}
                          </p>
                          <p className="mt-1 text-xs text-black/50">
                            {row.booking.reference} · {row.ticket.reference}
                          </p>
                        </div>
                        <span className="bg-[#f0f1ee] px-3 py-2 text-sm font-bold">
                          {row.ticket.seatNumber || "Auto"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm">
                        {ticketStatus[row.ticket.status] || row.ticket.status}
                      </p>
                    </article>
                  ))}
                </div>
                <div className="mt-5 hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-black/15">
                        <th className="p-3">Passager</th>
                        <th className="p-3">Réservation</th>
                        <th className="p-3">Siège</th>
                        <th className="p-3">Billet</th>
                        <th className="p-3">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleManifest.map((row) => (
                        <tr key={row.ticket.id} className="border-b border-black/10">
                          <td className="p-3 font-semibold">
                            {row.passenger.firstName} {row.passenger.lastName}
                          </td>
                          <td className="p-3">{row.booking.reference}</td>
                          <td className="p-3 font-bold">{row.ticket.seatNumber || "Auto"}</td>
                          <td className="p-3">{row.ticket.reference}</td>
                          <td className="p-3">
                            {ticketStatus[row.ticket.status] || row.ticket.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!visibleManifest.length ? (
                  <p className="p-6 text-center text-sm text-black/50">
                    {normalizedSearch
                      ? "Aucun passager ne correspond à cette recherche."
                      : "Aucun passager n'est encore enregistré sur ce trajet."}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </MobilityLayout>
  );
}
