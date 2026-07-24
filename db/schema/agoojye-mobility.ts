import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { tenants } from "./tenants";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const agoojyeMobilityBuses = pgTable(
  "agoojye_mobility_buses",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    reference: text("reference").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    capacity: integer("capacity").notNull(),
    seatSelectionEnabled: boolean("seat_selection_enabled").notNull().default(true),
    seatLayout: jsonb("seat_layout").$type<{ columns: number; aisleAfter: number; labels: string[] }>().notNull(),
    amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
    rangeKm: integer("range_km"),
    chargingMinutes: integer("charging_minutes"),
    intendedUse: text("intended_use"),
    heroImageUrl: text("hero_image_url"),
    model3dUrl: text("model_3d_url"),
    specificationsStatus: text("specifications_status").notNull().default("placeholder"),
    availabilityStatus: text("availability_status").notNull().default("available"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantSlugUnique: uniqueIndex("agoojye_mobility_buses_tenant_slug_uidx").on(t.tenantId, t.slug),
    tenantReferenceUnique: uniqueIndex("agoojye_mobility_buses_tenant_reference_uidx").on(t.tenantId, t.reference),
    byTenantStatus: index("agoojye_mobility_buses_tenant_status_idx").on(t.tenantId, t.active, t.availabilityStatus),
  }),
);

export const agoojyeMobilityBusImages = pgTable(
  "agoojye_mobility_bus_images",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    busId: integer("bus_id").references(() => agoojyeMobilityBuses.id, { onDelete: "cascade" }).notNull(),
    imageUrl: text("image_url").notNull(),
    altText: text("alt_text").notNull(),
    kind: text("kind").notNull().default("gallery"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ byBus: index("agoojye_mobility_bus_images_bus_idx").on(t.tenantId, t.busId, t.sortOrder) }),
);

export const agoojyeMobilityBusSpecifications = pgTable(
  "agoojye_mobility_bus_specifications",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    busId: integer("bus_id").references(() => agoojyeMobilityBuses.id, { onDelete: "cascade" }).notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    unit: text("unit"),
    verified: boolean("verified").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantBusLabelUnique: uniqueIndex("agoojye_mobility_bus_specs_tenant_bus_label_uidx").on(t.tenantId, t.busId, t.label),
  }),
);

export const agoojyeMobilityRoutes = pgTable(
  "agoojye_mobility_routes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    slug: text("slug").notNull(),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    boardingPoint: text("boarding_point").notNull(),
    arrivalPoint: text("arrival_point").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    baseFareXof: integer("base_fare_xof").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantSlugUnique: uniqueIndex("agoojye_mobility_routes_tenant_slug_uidx").on(t.tenantId, t.slug),
    byTenantCities: index("agoojye_mobility_routes_tenant_cities_idx").on(t.tenantId, t.origin, t.destination, t.active),
  }),
);

export const agoojyeMobilityStops = pgTable(
  "agoojye_mobility_stops",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    address: text("address"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ tenantNameUnique: uniqueIndex("agoojye_mobility_stops_tenant_name_uidx").on(t.tenantId, t.name) }),
);

export const agoojyeMobilityRouteStops = pgTable(
  "agoojye_mobility_route_stops",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    routeId: integer("route_id").references(() => agoojyeMobilityRoutes.id, { onDelete: "cascade" }).notNull(),
    stopId: integer("stop_id").references(() => agoojyeMobilityStops.id, { onDelete: "cascade" }).notNull(),
    sortOrder: integer("sort_order").notNull(),
    offsetMinutes: integer("offset_minutes").notNull().default(0),
    boardingAllowed: boolean("boarding_allowed").notNull().default(true),
    dropoffAllowed: boolean("dropoff_allowed").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantRouteOrderUnique: uniqueIndex("agoojye_mobility_route_stops_tenant_route_order_uidx").on(t.tenantId, t.routeId, t.sortOrder),
  }),
);

export const agoojyeMobilitySchedules = pgTable(
  "agoojye_mobility_schedules",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    routeId: integer("route_id").references(() => agoojyeMobilityRoutes.id, { onDelete: "cascade" }).notNull(),
    busId: integer("bus_id").references(() => agoojyeMobilityBuses.id, { onDelete: "restrict" }).notNull(),
    name: text("name").notNull(),
    departureTime: text("departure_time").notNull(),
    daysOfWeek: jsonb("days_of_week").$type<number[]>().notNull().default([]),
    fareXof: integer("fare_xof"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ byTenantRoute: index("agoojye_mobility_schedules_tenant_route_idx").on(t.tenantId, t.routeId, t.active) }),
);

export const agoojyeMobilityTrips = pgTable(
  "agoojye_mobility_trips",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    routeId: integer("route_id").references(() => agoojyeMobilityRoutes.id, { onDelete: "restrict" }).notNull(),
    busId: integer("bus_id").references(() => agoojyeMobilityBuses.id, { onDelete: "restrict" }).notNull(),
    scheduleId: integer("schedule_id").references(() => agoojyeMobilitySchedules.id, { onDelete: "set null" }),
    departureAt: timestamp("departure_at", { withTimezone: true }).notNull(),
    arrivalAt: timestamp("arrival_at", { withTimezone: true }).notNull(),
    fareXof: integer("fare_xof").notNull(),
    status: text("status").notNull().default("scheduled"),
    bookingOpen: boolean("booking_open").notNull().default(true),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    byTenantDeparture: index("agoojye_mobility_trips_tenant_departure_idx").on(t.tenantId, t.departureAt, t.status),
    tenantRouteDepartureUnique: uniqueIndex("agoojye_mobility_trips_tenant_route_departure_uidx").on(t.tenantId, t.routeId, t.departureAt),
  }),
);

export const agoojyeMobilityBookings = pgTable(
  "agoojye_mobility_bookings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tripId: integer("trip_id").references(() => agoojyeMobilityTrips.id, { onDelete: "restrict" }).notNull(),
    reference: text("reference").notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    passengerCount: integer("passenger_count").notNull(),
    subtotalXof: integer("subtotal_xof").notNull(),
    feesXof: integer("fees_xof").notNull().default(0),
    totalXof: integer("total_xof").notNull(),
    currency: text("currency").notNull().default("XOF"),
    status: text("status").notNull().default("hold"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex("agoojye_mobility_bookings_tenant_reference_uidx").on(t.tenantId, t.reference),
    accessTokenUnique: uniqueIndex("agoojye_mobility_bookings_access_token_uidx").on(t.accessTokenHash),
    byTenantTrip: index("agoojye_mobility_bookings_tenant_trip_idx").on(t.tenantId, t.tripId, t.status),
    byTenantContact: index("agoojye_mobility_bookings_tenant_contact_idx").on(t.tenantId, t.contactEmail, t.contactPhone),
  }),
);

export const agoojyeMobilityTripSeats = pgTable(
  "agoojye_mobility_trip_seats",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    tripId: integer("trip_id").references(() => agoojyeMobilityTrips.id, { onDelete: "cascade" }).notNull(),
    bookingId: integer("booking_id").references(() => agoojyeMobilityBookings.id, { onDelete: "set null" }),
    seatNumber: text("seat_number").notNull(),
    status: text("status").notNull().default("available"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    blockedReason: text("blocked_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantTripSeatUnique: uniqueIndex("agoojye_mobility_trip_seats_tenant_trip_seat_uidx").on(t.tenantId, t.tripId, t.seatNumber),
    byTenantTripStatus: index("agoojye_mobility_trip_seats_tenant_trip_status_idx").on(t.tenantId, t.tripId, t.status),
  }),
);

export const agoojyeMobilityBookingPassengers = pgTable(
  "agoojye_mobility_booking_passengers",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    bookingId: integer("booking_id").references(() => agoojyeMobilityBookings.id, { onDelete: "cascade" }).notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    identificationReference: text("identification_reference"),
    assistanceNote: text("assistance_note"),
    seatNumber: text("seat_number"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ byBooking: index("agoojye_mobility_passengers_booking_idx").on(t.tenantId, t.bookingId) }),
);

export const agoojyeMobilityPayments = pgTable(
  "agoojye_mobility_payments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    bookingId: integer("booking_id").references(() => agoojyeMobilityBookings.id, { onDelete: "cascade" }).notNull(),
    provider: text("provider").notNull(),
    method: text("method").notNull(),
    externalReference: text("external_reference").notNull(),
    amountXof: integer("amount_xof").notNull(),
    currency: text("currency").notNull().default("XOF"),
    status: text("status").notNull().default("pending"),
    demo: boolean("demo").notNull().default(true),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantExternalUnique: uniqueIndex("agoojye_mobility_payments_tenant_external_uidx").on(t.tenantId, t.externalReference),
    byTenantBooking: index("agoojye_mobility_payments_tenant_booking_idx").on(t.tenantId, t.bookingId, t.status),
  }),
);

export const agoojyeMobilityTickets = pgTable(
  "agoojye_mobility_tickets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    bookingId: integer("booking_id").references(() => agoojyeMobilityBookings.id, { onDelete: "cascade" }).notNull(),
    passengerId: integer("passenger_id").references(() => agoojyeMobilityBookingPassengers.id, { onDelete: "cascade" }).notNull(),
    tripId: integer("trip_id").references(() => agoojyeMobilityTrips.id, { onDelete: "restrict" }).notNull(),
    reference: text("reference").notNull(),
    publicToken: text("public_token").notNull(),
    seatNumber: text("seat_number"),
    status: text("status").notNull().default("active"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex("agoojye_mobility_tickets_tenant_reference_uidx").on(t.tenantId, t.reference),
    publicTokenUnique: uniqueIndex("agoojye_mobility_tickets_public_token_uidx").on(t.publicToken),
    passengerUnique: uniqueIndex("agoojye_mobility_tickets_passenger_uidx").on(t.passengerId),
    byTenantTrip: index("agoojye_mobility_tickets_tenant_trip_idx").on(t.tenantId, t.tripId, t.status),
  }),
);

export const agoojyeMobilityTicketValidations = pgTable(
  "agoojye_mobility_ticket_validations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    ticketId: integer("ticket_id").references(() => agoojyeMobilityTickets.id, { onDelete: "cascade" }).notNull(),
    tripId: integer("trip_id").references(() => agoojyeMobilityTrips.id, { onDelete: "restrict" }).notNull(),
    validatorUserId: integer("validator_user_id"),
    result: text("result").notNull(),
    deviceMetadata: jsonb("device_metadata").$type<Record<string, unknown>>().notNull().default({}),
    validatedAt: timestamp("validated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ byTenantTicket: index("agoojye_mobility_validations_ticket_idx").on(t.tenantId, t.ticketId, t.validatedAt) }),
);

export const agoojyeMobilityBusReservationRequests = pgTable(
  "agoojye_mobility_bus_reservation_requests",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    reference: text("reference").notNull(),
    customerType: text("customer_type").notNull(),
    organizationName: text("organization_name"),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    departureAt: timestamp("departure_at", { withTimezone: true }).notNull(),
    returnAt: timestamp("return_at", { withTimezone: true }),
    tripType: text("trip_type").notNull().default("one-way"),
    passengerCount: integer("passenger_count").notNull(),
    preferredBusType: text("preferred_bus_type"),
    purpose: text("purpose"),
    accessibilityNeeds: text("accessibility_needs"),
    notes: text("notes"),
    requestAction: text("request_action").notNull().default("quote"),
    status: text("status").notNull().default("new"),
    internalNotes: text("internal_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex("agoojye_mobility_bus_requests_tenant_reference_uidx").on(t.tenantId, t.reference),
    byTenantStatus: index("agoojye_mobility_bus_requests_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const agoojyeMobilityDemoRequests = pgTable(
  "agoojye_mobility_demo_requests",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    reference: text("reference").notNull(),
    requestType: text("request_type").notNull(),
    fullName: text("full_name").notNull(),
    organization: text("organization"),
    role: text("role"),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    city: text("city").notNull(),
    preferredDate: timestamp("preferred_date", { withTimezone: true }),
    participantCount: integer("participant_count").notNull().default(1),
    message: text("message"),
    status: text("status").notNull().default("new"),
    internalNotes: text("internal_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex("agoojye_mobility_demo_requests_tenant_reference_uidx").on(t.tenantId, t.reference),
    byTenantStatus: index("agoojye_mobility_demo_requests_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const agoojyeMobilityBusOrderRequests = pgTable(
  "agoojye_mobility_bus_order_requests",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    reference: text("reference").notNull(),
    organization: text("organization").notNull(),
    contactName: text("contact_name").notNull(),
    role: text("role"),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    country: text("country").notNull().default("Benin"),
    city: text("city").notNull(),
    quantity: integer("quantity").notNull(),
    intendedUse: text("intended_use").notNull(),
    expectedCapacity: integer("expected_capacity"),
    desiredDeliveryPeriod: text("desired_delivery_period"),
    budgetRange: text("budget_range"),
    financingInterest: boolean("financing_interest").notNull().default(false),
    chargingInfrastructureInterest: boolean("charging_infrastructure_interest").notNull().default(false),
    message: text("message"),
    status: text("status").notNull().default("new"),
    internalNotes: text("internal_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantReferenceUnique: uniqueIndex("agoojye_mobility_orders_tenant_reference_uidx").on(t.tenantId, t.reference),
    byTenantStatus: index("agoojye_mobility_orders_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);

export const agoojyeMobilityWaitlistEntries = pgTable(
  "agoojye_mobility_waitlist_entries",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    city: text("city"),
    country: text("country").notNull().default("Benin"),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    consent: boolean("consent").notNull().default(false),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    tenantEmailUnique: uniqueIndex("agoojye_mobility_waitlist_tenant_email_uidx").on(t.tenantId, t.email),
    byTenantStatus: index("agoojye_mobility_waitlist_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);
