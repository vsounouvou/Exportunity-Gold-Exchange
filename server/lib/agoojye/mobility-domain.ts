export const BOOKABLE_TRIP_STATUSES = ["scheduled", "boarding"] as const;

export type TripSearchRecord = {
  origin: string;
  destination: string;
  departureAt: Date | string;
  status: string;
  bookingOpen: boolean;
  remainingSeats: number;
};

export function isTripBookable(input: Pick<TripSearchRecord, "departureAt" | "status" | "bookingOpen" | "remainingSeats"> & { passengers: number; now?: Date }) {
  const now = input.now || new Date();
  return BOOKABLE_TRIP_STATUSES.includes(input.status as (typeof BOOKABLE_TRIP_STATUSES)[number])
    && input.bookingOpen
    && new Date(input.departureAt) > now
    && input.remainingSeats >= input.passengers;
}

export function filterTripSearch(records: TripSearchRecord[], criteria: { origin?: string; destination?: string; date?: string; passengers: number; now?: Date }) {
  const origin = String(criteria.origin || "").trim().toLocaleLowerCase("fr");
  const destination = String(criteria.destination || "").trim().toLocaleLowerCase("fr");
  return records.filter((record) => {
    const departure = new Date(record.departureAt);
    if (origin && record.origin.toLocaleLowerCase("fr") !== origin) return false;
    if (destination && record.destination.toLocaleLowerCase("fr") !== destination) return false;
    if (criteria.date && departure.toISOString().slice(0, 10) !== criteria.date) return false;
    return isTripBookable({ ...record, passengers: criteria.passengers, now: criteria.now });
  });
}

export type DemoPaymentOutcome = "success" | "pending" | "failed";

export function resolveDemoPaymentState(outcome: DemoPaymentOutcome) {
  if (outcome === "success") return { paymentStatus: "paid", bookingStatus: "confirmed", seatsStatus: "sold" } as const;
  if (outcome === "pending") return { paymentStatus: "pending", bookingStatus: "pending_payment", seatsStatus: "held" } as const;
  return { paymentStatus: "failed", bookingStatus: "payment_failed", seatsStatus: "available" } as const;
}

export type TicketValidationInput = {
  found: boolean;
  ticketStatus?: string;
  paymentStatus?: string;
  ticketTripId?: number;
  selectedTripId?: number;
};

export function resolveTicketValidation(input: TicketValidationInput) {
  if (!input.found) return "not_found";
  if (input.ticketStatus === "used") return "already_used";
  if (input.ticketStatus === "cancelled") return "cancelled";
  if (input.ticketStatus !== "active") return "invalid";
  if (input.paymentStatus !== "paid") return "payment_unconfirmed";
  if (input.ticketTripId !== input.selectedTripId) return "wrong_trip";
  return "valid";
}
