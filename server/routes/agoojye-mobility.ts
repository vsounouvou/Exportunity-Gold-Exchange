import { createHash, createHmac, randomBytes } from "node:crypto";

import { Router } from "express";
import QRCode from "qrcode";
import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@db";
import {
  agoojyeMobilityBookingPassengers,
  agoojyeMobilityBookings,
  agoojyeMobilityBusImages,
  agoojyeMobilityBusOrderRequests,
  agoojyeMobilityBusReservationRequests,
  agoojyeMobilityBusSpecifications,
  agoojyeMobilityBuses,
  agoojyeMobilityDemoRequests,
  agoojyeMobilityPayments,
  agoojyeMobilityRouteStops,
  agoojyeMobilityRoutes,
  agoojyeMobilitySchedules,
  agoojyeMobilityStops,
  agoojyeMobilityTicketValidations,
  agoojyeMobilityTickets,
  agoojyeMobilityTrips,
  agoojyeMobilityTripSeats,
  agoojyeMobilityWaitlistEntries,
} from "@db/schema";

import { ensureTenantAdmin, ensureTenantStaff } from "./utils/auth";
import { BOOKABLE_TRIP_STATUSES, isTripBookable, resolveDemoPaymentState, resolveTicketValidation } from "../lib/agoojye/mobility-domain";

const router = Router();
const publicApi = Router();
const staffApi = Router();
const adminApi = Router();

const seededTenants = new Set<number>();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const HOLD_MINUTES = Math.max(5, Math.min(60, Number(process.env.AGOOJIYE_BOOKING_HOLD_MINUTES || 15)));
const APP_URL = String(process.env.AGOOJIYE_APP_URL || process.env.PUBLIC_APP_URL || "https://agoojiye.com").replace(/\/$/, "");
const TICKET_SECRET = String(process.env.AGOOJIYE_TICKET_SIGNING_SECRET || process.env.SESSION_SECRET || "agoojiye-demo-ticket-secret");

const clean = (value: unknown) => String(value ?? "").trim();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const makeToken = () => randomBytes(24).toString("base64url");
const makeTicketToken = () => {
  const nonce = makeToken();
  const signature = createHmac("sha256", TICKET_SECRET).update(nonce).digest("base64url").slice(0, 22);
  return `${nonce}.${signature}`;
};
const makeReference = (prefix: string) => `${prefix}-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
const parseDate = (value: unknown) => {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
};

function requireAgoojyeTenant(req: any, res: any) {
  const tenant = req.tenant;
  if (!tenant || clean(tenant.key).toLowerCase() !== "agoojye") {
    res.status(404).json({ message: "Le service mobilité AGOOJIYE n'est pas disponible sur ce domaine." });
    return null;
  }
  return Number(tenant.id);
}

function checkRateLimit(req: any, res: any, limit = 40) {
  const key = clean(req.ip || req.headers["x-forwarded-for"] || "unknown").slice(0, 120);
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (bucket.count >= limit) {
    res.status(429).json({ message: "Trop de demandes. Réessayez dans quelques minutes." });
    return false;
  }
  bucket.count += 1;
  return true;
}

function seatLabels(capacity: number) {
  const labels: string[] = [];
  const columns = ["A", "B", "C", "D"];
  for (let index = 0; index < capacity; index += 1) {
    labels.push(`${Math.floor(index / columns.length) + 1}${columns[index % columns.length]}`);
  }
  return labels;
}

const BUS_SEED = [
  {
    slug: "agoojiye-shuttle",
    name: "AGOOJIYE Shuttle",
    reference: "AGJ-SH-01",
    category: "Navette électrique",
    description: "Navette ouverte pensée pour les liaisons urbaines, les sites et les événements.",
    capacity: 16,
    seatSelectionEnabled: true,
    seatLayout: { columns: 4, aisleAfter: 2, labels: seatLabels(16) },
    amenities: ["Recharge USB", "Accès facilité", "Information voyageur"],
    rangeKm: 120,
    chargingMinutes: 240,
    intendedUse: "Navettes urbaines, hôtels, sites et événements",
    heroImageUrl: "/brand/agoojiye/vehicle/sections/agoojiye-shuttle-side-profile-1280.webp",
    specificationsStatus: "placeholder",
    availabilityStatus: "available",
    active: true,
  },
  {
    slug: "agoojiye-urban",
    name: "AGOOJIYE Urban",
    reference: "AGJ-UR-01",
    category: "Bus urbain électrique",
    description: "Configuration de démonstration pour les lignes urbaines à fréquence régulière.",
    capacity: 24,
    seatSelectionEnabled: true,
    seatLayout: { columns: 4, aisleAfter: 2, labels: seatLabels(24) },
    amenities: ["Climatisation", "Recharge USB", "Zone accessible"],
    rangeKm: 180,
    chargingMinutes: 300,
    intendedUse: "Lignes urbaines et transport de personnel",
    heroImageUrl: "/brand/agoojiye/vehicle/hero/agoojiye-shuttle-hero-1280.webp",
    specificationsStatus: "placeholder",
    availabilityStatus: "planned",
    active: true,
  },
  {
    slug: "agoojiye-intercity",
    name: "AGOOJIYE Intercity",
    reference: "AGJ-IC-01",
    category: "Bus interurbain électrique",
    description: "Configuration de démonstration destinée aux déplacements confortables entre villes.",
    capacity: 32,
    seatSelectionEnabled: true,
    seatLayout: { columns: 4, aisleAfter: 2, labels: seatLabels(32) },
    amenities: ["Climatisation", "Bagages", "Recharge USB", "Wi-Fi prévu"],
    rangeKm: 260,
    chargingMinutes: 360,
    intendedUse: "Liaisons interurbaines et tourisme",
    heroImageUrl: "/brand/agoojiye/vehicle/sections/agoojiye-shuttle-rear-three-quarter-1280.webp",
    specificationsStatus: "placeholder",
    availabilityStatus: "planned",
    active: true,
  },
] as const;

const ROUTE_SEED = [
  ["cotonou-porto-novo", "Cotonou", "Porto-Novo", "Place de l'Étoile Rouge", "Gare de Porto-Novo", 70, 2500],
  ["cotonou-ouidah", "Cotonou", "Ouidah", "Place de l'Étoile Rouge", "Fort portugais de Ouidah", 65, 3000],
  ["cotonou-abomey-calavi", "Cotonou", "Abomey-Calavi", "Carrefour Vêdoko", "Carrefour IITA", 50, 1800],
  ["porto-novo-cotonou", "Porto-Novo", "Cotonou", "Gare de Porto-Novo", "Place de l'Étoile Rouge", 70, 2500],
] as const;

async function ensureMobilitySeed(tenantId: number) {
  if (seededTenants.has(tenantId)) return;
  const now = new Date();

  await db
    .insert(agoojyeMobilityBuses)
    .values(BUS_SEED.map((bus) => ({
      tenantId,
      ...bus,
      amenities: [...bus.amenities],
      seatLayout: { ...bus.seatLayout, labels: [...bus.seatLayout.labels] },
      createdAt: now,
      updatedAt: now,
    })))
    .onConflictDoUpdate({
      target: [agoojyeMobilityBuses.tenantId, agoojyeMobilityBuses.slug],
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        description: sql`excluded.description`,
        capacity: sql`excluded.capacity`,
        seatLayout: sql`excluded.seat_layout`,
        amenities: sql`excluded.amenities`,
        heroImageUrl: sql`excluded.hero_image_url`,
        updatedAt: now,
      },
    });

  await db
    .insert(agoojyeMobilityRoutes)
    .values(
      ROUTE_SEED.map(([slug, origin, destination, boardingPoint, arrivalPoint, durationMinutes, baseFareXof]) => ({
        tenantId,
        slug,
        origin,
        destination,
        boardingPoint,
        arrivalPoint,
        durationMinutes,
        baseFareXof,
        description: `${origin} vers ${destination}, données de lancement configurables.`,
        active: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [agoojyeMobilityRoutes.tenantId, agoojyeMobilityRoutes.slug],
      set: {
        origin: sql`excluded.origin`,
        destination: sql`excluded.destination`,
        boardingPoint: sql`excluded.boarding_point`,
        arrivalPoint: sql`excluded.arrival_point`,
        durationMinutes: sql`excluded.duration_minutes`,
        baseFareXof: sql`excluded.base_fare_xof`,
        updatedAt: now,
      },
    });

  const [buses, routes] = await Promise.all([
    db.select().from(agoojyeMobilityBuses).where(and(eq(agoojyeMobilityBuses.tenantId, tenantId), eq(agoojyeMobilityBuses.active, true))).orderBy(asc(agoojyeMobilityBuses.id)),
    db.select().from(agoojyeMobilityRoutes).where(and(eq(agoojyeMobilityRoutes.tenantId, tenantId), eq(agoojyeMobilityRoutes.active, true))).orderBy(asc(agoojyeMobilityRoutes.id)),
  ]);
  if (!buses.length || !routes.length) return;

  const tripValues: Array<typeof agoojyeMobilityTrips.$inferInsert> = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
      const route = routes[routeIndex];
      const departureAt = new Date(base);
      departureAt.setDate(base.getDate() + dayOffset);
      departureAt.setHours(7 + routeIndex * 2 + (dayOffset % 2), routeIndex % 2 ? 30 : 0, 0, 0);
      if (departureAt <= new Date()) departureAt.setDate(departureAt.getDate() + 1);
      const arrivalAt = new Date(departureAt.getTime() + route.durationMinutes * 60_000);
      tripValues.push({
        tenantId,
        routeId: route.id,
        busId: buses[(routeIndex + dayOffset) % buses.length].id,
        departureAt,
        arrivalAt,
        fareXof: route.baseFareXof,
        status: "scheduled",
        bookingOpen: true,
        notes: "Trajet de démonstration configurable dans l'administration.",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  await db.insert(agoojyeMobilityTrips).values(tripValues).onConflictDoNothing();

  const upcomingTrips = await db
    .select({ trip: agoojyeMobilityTrips, bus: agoojyeMobilityBuses })
    .from(agoojyeMobilityTrips)
    .innerJoin(agoojyeMobilityBuses, eq(agoojyeMobilityTrips.busId, agoojyeMobilityBuses.id))
    .where(and(eq(agoojyeMobilityTrips.tenantId, tenantId), gt(agoojyeMobilityTrips.departureAt, new Date())))
    .orderBy(asc(agoojyeMobilityTrips.departureAt))
    .limit(28);
  const tripSeatValues = upcomingTrips.flatMap(({ trip, bus }) =>
    seatLabels(bus.capacity).map((seatNumber) => ({ tenantId, tripId: trip.id, seatNumber, status: "available", createdAt: now, updatedAt: now })),
  );
  if (tripSeatValues.length) await db.insert(agoojyeMobilityTripSeats).values(tripSeatValues).onConflictDoNothing();

  const existingBookings = await db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityBookings).where(eq(agoojyeMobilityBookings.tenantId, tenantId));
  if (Number(existingBookings[0]?.count || 0) === 0 && upcomingTrips.length >= 3) {
    await db.transaction(async (tx: any) => {
      const confirmedTrip = upcomingTrips[0].trip;
      const [confirmed] = await tx.insert(agoojyeMobilityBookings).values({ tenantId, tripId: confirmedTrip.id, reference: "AGJ-DEMO-001", accessTokenHash: hash("demo-booking-token-001"), contactEmail: "demo.passager@agoojiye.com", contactPhone: "+2290100000001", passengerCount: 2, subtotalXof: confirmedTrip.fareXof * 2, feesXof: 0, totalXof: confirmedTrip.fareXof * 2, currency: "XOF", status: "confirmed", paymentStatus: "paid", confirmedAt: now, createdAt: now, updatedAt: now }).returning();
      const confirmedSeats = seatLabels(upcomingTrips[0].bus.capacity).slice(0, 2);
      const passengers = await tx.insert(agoojyeMobilityBookingPassengers).values([
        { tenantId, bookingId: confirmed.id, firstName: "Awa", lastName: "Démonstration", phone: "+2290100000001", email: "demo.passager@agoojiye.com", seatNumber: confirmedSeats[0], createdAt: now, updatedAt: now },
        { tenantId, bookingId: confirmed.id, firstName: "Koffi", lastName: "Démonstration", phone: "+2290100000002", seatNumber: confirmedSeats[1], createdAt: now, updatedAt: now },
      ]).returning();
      await tx.update(agoojyeMobilityTripSeats).set({ bookingId: confirmed.id, status: "sold", updatedAt: now }).where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.tripId, confirmedTrip.id), inArray(agoojyeMobilityTripSeats.seatNumber, confirmedSeats)));
      await tx.insert(agoojyeMobilityPayments).values({ tenantId, bookingId: confirmed.id, provider: "demo", method: "mobile_money", externalReference: "PAY-DEMO-001", amountXof: confirmed.totalXof, currency: "XOF", status: "paid", demo: true, paidAt: now, metadata: { seeded: true, explicitDemo: true }, createdAt: now, updatedAt: now });
      await tx.insert(agoojyeMobilityTickets).values(passengers.map((passenger: any, index: number) => ({ tenantId, bookingId: confirmed.id, passengerId: passenger.id, tripId: confirmedTrip.id, reference: `TKT-DEMO-00${index + 1}`, publicToken: makeTicketToken(), seatNumber: passenger.seatNumber, status: "active", issuedAt: now, createdAt: now, updatedAt: now })));

      const pendingTrip = upcomingTrips[1].trip;
      const pendingExpiry = new Date(Date.now() + HOLD_MINUTES * 60_000);
      const [pending] = await tx.insert(agoojyeMobilityBookings).values({ tenantId, tripId: pendingTrip.id, reference: "AGJ-DEMO-002", accessTokenHash: hash("demo-booking-token-002"), contactEmail: "demo.attente@agoojiye.com", contactPhone: "+2290100000003", passengerCount: 1, subtotalXof: pendingTrip.fareXof, feesXof: 0, totalXof: pendingTrip.fareXof, currency: "XOF", status: "pending_payment", paymentStatus: "pending", holdExpiresAt: pendingExpiry, createdAt: now, updatedAt: now }).returning();
      const pendingSeat = seatLabels(upcomingTrips[1].bus.capacity)[0];
      await tx.insert(agoojyeMobilityBookingPassengers).values({ tenantId, bookingId: pending.id, firstName: "Sika", lastName: "En attente", phone: "+2290100000003", email: "demo.attente@agoojiye.com", seatNumber: pendingSeat, createdAt: now, updatedAt: now });
      await tx.update(agoojyeMobilityTripSeats).set({ bookingId: pending.id, status: "held", holdExpiresAt: pendingExpiry, updatedAt: now }).where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.tripId, pendingTrip.id), eq(agoojyeMobilityTripSeats.seatNumber, pendingSeat)));
      await tx.insert(agoojyeMobilityPayments).values({ tenantId, bookingId: pending.id, provider: "demo", method: "card", externalReference: "PAY-DEMO-002", amountXof: pending.totalXof, currency: "XOF", status: "pending", demo: true, metadata: { seeded: true, explicitDemo: true }, createdAt: now, updatedAt: now });

      const failedTrip = upcomingTrips[2].trip;
      const [failed] = await tx.insert(agoojyeMobilityBookings).values({ tenantId, tripId: failedTrip.id, reference: "AGJ-DEMO-003", accessTokenHash: hash("demo-booking-token-003"), contactEmail: "demo.echec@agoojiye.com", contactPhone: "+2290100000004", passengerCount: 1, subtotalXof: failedTrip.fareXof, feesXof: 0, totalXof: failedTrip.fareXof, currency: "XOF", status: "payment_failed", paymentStatus: "failed", createdAt: now, updatedAt: now }).returning();
      await tx.insert(agoojyeMobilityPayments).values({ tenantId, bookingId: failed.id, provider: "demo", method: "mobile_money", externalReference: "PAY-DEMO-003", amountXof: failed.totalXof, currency: "XOF", status: "failed", demo: true, metadata: { seeded: true, explicitDemo: true }, createdAt: now, updatedAt: now });
    });
  }

  const existingRequests = await db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityDemoRequests).where(eq(agoojyeMobilityDemoRequests.tenantId, tenantId));
  if (Number(existingRequests[0]?.count || 0) === 0) {
    await db.insert(agoojyeMobilityDemoRequests).values({
      tenantId,
      reference: "DEMO-EXEMPLE",
      requestType: "visite",
      fullName: "Visiteur de démonstration",
      organization: "Organisation exemple",
      email: "demo@agoojiye.com",
      phone: "+229 01 00 00 00 00",
      city: "Cotonou",
      preferredDate: new Date(Date.now() + 10 * 86_400_000),
      participantCount: 4,
      message: "Enregistrement de démonstration clairement identifié.",
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
  }
  const existingBusRequests = await db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityBusReservationRequests).where(eq(agoojyeMobilityBusReservationRequests.tenantId, tenantId));
  if (Number(existingBusRequests[0]?.count || 0) === 0) {
    await db.insert(agoojyeMobilityBusReservationRequests).values({ tenantId, reference: "BUS-DEMO-001", customerType: "entreprise", organizationName: "Entreprise de démonstration", contactName: "Responsable mobilité", email: "demo.groupe@agoojiye.com", phone: "+2290100000010", origin: "Cotonou", destination: "Ouidah", departureAt: new Date(Date.now() + 14 * 86_400_000), tripType: "round-trip", passengerCount: 14, preferredBusType: "AGOOJIYE Shuttle", purpose: "Transport d'équipe", notes: "Donnée de démonstration", requestAction: "quote", status: "new", createdAt: now, updatedAt: now });
  }
  const existingOrders = await db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityBusOrderRequests).where(eq(agoojyeMobilityBusOrderRequests.tenantId, tenantId));
  if (Number(existingOrders[0]?.count || 0) === 0) {
    await db.insert(agoojyeMobilityBusOrderRequests).values({ tenantId, reference: "CMD-DEMO-001", organization: "Opérateur de démonstration", contactName: "Direction des opérations", email: "demo.flotte@agoojiye.com", phone: "+2290100000011", country: "Bénin", city: "Cotonou", quantity: 3, intendedUse: "Navettes de personnel", expectedCapacity: 24, desiredDeliveryPeriod: "À confirmer", financingInterest: true, chargingInfrastructureInterest: true, message: "Donnée de démonstration", status: "new", createdAt: now, updatedAt: now });
  }
  const existingWaitlist = await db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityWaitlistEntries).where(eq(agoojyeMobilityWaitlistEntries.tenantId, tenantId));
  if (Number(existingWaitlist[0]?.count || 0) === 0) {
    await db.insert(agoojyeMobilityWaitlistEntries).values([
      { tenantId, firstName: "Mariam", lastName: "Démonstration", email: "demo.priorite1@agoojiye.com", city: "Cotonou", country: "Bénin", interests: ["first_trips", "new_routes"], consent: true, status: "active", createdAt: now, updatedAt: now },
      { tenantId, firstName: "Joël", lastName: "Démonstration", email: "demo.priorite2@agoojiye.com", city: "Porto-Novo", country: "Bénin", interests: ["demonstrations", "partnerships"], consent: true, status: "active", createdAt: now, updatedAt: now },
    ]);
  }
  seededTenants.add(tenantId);
}

export async function seedAgoojiyeMobility(tenantId: number) {
  seededTenants.delete(tenantId);
  await ensureMobilitySeed(tenantId);
}

async function releaseExpiredHolds(tx: any, tenantId: number) {
  const now = new Date();
  await tx
    .update(agoojyeMobilityTripSeats)
    .set({ status: "available", bookingId: null, holdExpiresAt: null, updatedAt: now })
    .where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.status, "held"), lt(agoojyeMobilityTripSeats.holdExpiresAt, now)));
  await tx
    .update(agoojyeMobilityBookings)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(agoojyeMobilityBookings.tenantId, tenantId), inArray(agoojyeMobilityBookings.status, ["hold", "pending_payment"]), lt(agoojyeMobilityBookings.holdExpiresAt, now)));
}

async function tripDetails(tenantId: number, tripId: number) {
  const [row] = await db
    .select({ trip: agoojyeMobilityTrips, route: agoojyeMobilityRoutes, bus: agoojyeMobilityBuses })
    .from(agoojyeMobilityTrips)
    .innerJoin(agoojyeMobilityRoutes, eq(agoojyeMobilityTrips.routeId, agoojyeMobilityRoutes.id))
    .innerJoin(agoojyeMobilityBuses, eq(agoojyeMobilityTrips.busId, agoojyeMobilityBuses.id))
    .where(and(eq(agoojyeMobilityTrips.tenantId, tenantId), eq(agoojyeMobilityTrips.id, tripId)))
    .limit(1);
  return row || null;
}

async function publicBookingPayload(tenantId: number, bookingId: number) {
  const [bookingRow] = await db
    .select({ booking: agoojyeMobilityBookings, trip: agoojyeMobilityTrips, route: agoojyeMobilityRoutes, bus: agoojyeMobilityBuses })
    .from(agoojyeMobilityBookings)
    .innerJoin(agoojyeMobilityTrips, eq(agoojyeMobilityBookings.tripId, agoojyeMobilityTrips.id))
    .innerJoin(agoojyeMobilityRoutes, eq(agoojyeMobilityTrips.routeId, agoojyeMobilityRoutes.id))
    .innerJoin(agoojyeMobilityBuses, eq(agoojyeMobilityTrips.busId, agoojyeMobilityBuses.id))
    .where(and(eq(agoojyeMobilityBookings.tenantId, tenantId), eq(agoojyeMobilityBookings.id, bookingId)))
    .limit(1);
  if (!bookingRow) return null;
  const [passengers, tickets, payments] = await Promise.all([
    db.select().from(agoojyeMobilityBookingPassengers).where(and(eq(agoojyeMobilityBookingPassengers.tenantId, tenantId), eq(agoojyeMobilityBookingPassengers.bookingId, bookingId))).orderBy(asc(agoojyeMobilityBookingPassengers.id)),
    db.select().from(agoojyeMobilityTickets).where(and(eq(agoojyeMobilityTickets.tenantId, tenantId), eq(agoojyeMobilityTickets.bookingId, bookingId))).orderBy(asc(agoojyeMobilityTickets.id)),
    db.select().from(agoojyeMobilityPayments).where(and(eq(agoojyeMobilityPayments.tenantId, tenantId), eq(agoojyeMobilityPayments.bookingId, bookingId))).orderBy(desc(agoojyeMobilityPayments.createdAt)),
  ]);
  return { ...bookingRow, passengers, tickets, payment: payments[0] || null };
}

const tripSearchSchema = z.object({
  origin: z.string().trim().min(2).optional(),
  destination: z.string().trim().min(2).optional(),
  date: z.string().optional(),
  passengers: z.coerce.number().int().min(1).max(8).default(1),
});

const holdSchema = z.object({
  tripId: z.coerce.number().int().positive(),
  passengerCount: z.coerce.number().int().min(1).max(8),
  seatNumbers: z.array(z.string().trim().min(2).max(8)).max(8).default([]),
});

const passengerSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(30).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  identificationReference: z.string().trim().max(80).optional().or(z.literal("")),
  assistanceNote: z.string().trim().max(500).optional().or(z.literal("")),
});

publicApi.use(async (req: any, res, next) => {
  try {
    const tenantId = requireAgoojyeTenant(req, res);
    if (!tenantId) return;
    await ensureMobilitySeed(tenantId);
    (req as any).mobilityTenantId = tenantId;
    next();
  } catch (error) {
    next(error);
  }
});

publicApi.get("/bootstrap", async (req: any, res) => {
  const tenantId = req.mobilityTenantId as number;
  await db.transaction((tx: any) => releaseExpiredHolds(tx, tenantId));
  const [buses, routes, upcoming] = await Promise.all([
    db.select().from(agoojyeMobilityBuses).where(and(eq(agoojyeMobilityBuses.tenantId, tenantId), eq(agoojyeMobilityBuses.active, true))).orderBy(asc(agoojyeMobilityBuses.id)),
    db.select().from(agoojyeMobilityRoutes).where(and(eq(agoojyeMobilityRoutes.tenantId, tenantId), eq(agoojyeMobilityRoutes.active, true))).orderBy(asc(agoojyeMobilityRoutes.id)),
    db
      .select({ trip: agoojyeMobilityTrips, route: agoojyeMobilityRoutes, bus: agoojyeMobilityBuses, remainingSeats: sql<number>`count(${agoojyeMobilityTripSeats.id}) filter (where ${agoojyeMobilityTripSeats.status} = 'available')` })
      .from(agoojyeMobilityTrips)
      .innerJoin(agoojyeMobilityRoutes, eq(agoojyeMobilityTrips.routeId, agoojyeMobilityRoutes.id))
      .innerJoin(agoojyeMobilityBuses, eq(agoojyeMobilityTrips.busId, agoojyeMobilityBuses.id))
      .leftJoin(agoojyeMobilityTripSeats, and(eq(agoojyeMobilityTripSeats.tripId, agoojyeMobilityTrips.id), eq(agoojyeMobilityTripSeats.tenantId, tenantId)))
      .where(and(eq(agoojyeMobilityTrips.tenantId, tenantId), gt(agoojyeMobilityTrips.departureAt, new Date()), inArray(agoojyeMobilityTrips.status, [...BOOKABLE_TRIP_STATUSES])))
      .groupBy(agoojyeMobilityTrips.id, agoojyeMobilityRoutes.id, agoojyeMobilityBuses.id)
      .orderBy(asc(agoojyeMobilityTrips.departureAt))
      .limit(8),
  ]);
  res.json({ ok: true, demoMode: true, currency: "XOF", holdMinutes: HOLD_MINUTES, buses, routes, upcoming });
});

publicApi.get("/trips", async (req: any, res) => {
  const parsed = tripSearchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "Critères de recherche invalides.", issues: parsed.error.flatten() });
  const tenantId = req.mobilityTenantId as number;
  await db.transaction((tx: any) => releaseExpiredHolds(tx, tenantId));
  const { origin, destination, date, passengers } = parsed.data;
  const filters: any[] = [eq(agoojyeMobilityTrips.tenantId, tenantId), gt(agoojyeMobilityTrips.departureAt, new Date())];
  if (origin) filters.push(ilike(agoojyeMobilityRoutes.origin, origin));
  if (destination) filters.push(ilike(agoojyeMobilityRoutes.destination, destination));
  if (date) {
    const start = parseDate(`${date}T00:00:00`);
    if (!start) return res.status(400).json({ message: "Date de voyage invalide." });
    const end = new Date(start.getTime() + 86_400_000);
    filters.push(gte(agoojyeMobilityTrips.departureAt, start), lt(agoojyeMobilityTrips.departureAt, end));
  }
  const rows = await db
    .select({ trip: agoojyeMobilityTrips, route: agoojyeMobilityRoutes, bus: agoojyeMobilityBuses, remainingSeats: sql<number>`count(${agoojyeMobilityTripSeats.id}) filter (where ${agoojyeMobilityTripSeats.status} = 'available')` })
    .from(agoojyeMobilityTrips)
    .innerJoin(agoojyeMobilityRoutes, eq(agoojyeMobilityTrips.routeId, agoojyeMobilityRoutes.id))
    .innerJoin(agoojyeMobilityBuses, eq(agoojyeMobilityTrips.busId, agoojyeMobilityBuses.id))
    .leftJoin(agoojyeMobilityTripSeats, and(eq(agoojyeMobilityTripSeats.tripId, agoojyeMobilityTrips.id), eq(agoojyeMobilityTripSeats.tenantId, tenantId)))
    .where(and(...filters))
    .groupBy(agoojyeMobilityTrips.id, agoojyeMobilityRoutes.id, agoojyeMobilityBuses.id)
    .orderBy(asc(agoojyeMobilityTrips.departureAt));
  const trips = rows.map((row) => ({ ...row, bookable: isTripBookable({ departureAt: row.trip.departureAt, status: row.trip.status, bookingOpen: row.trip.bookingOpen, remainingSeats: Number(row.remainingSeats), passengers }) }));
  res.json({ ok: true, criteria: parsed.data, trips });
});

publicApi.get("/trips/:id", async (req: any, res) => {
  const tenantId = req.mobilityTenantId as number;
  const id = Number(req.params.id);
  const row = await tripDetails(tenantId, id);
  if (!row) return res.status(404).json({ message: "Trajet introuvable." });
  const seats = await db.select().from(agoojyeMobilityTripSeats).where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.tripId, id))).orderBy(asc(agoojyeMobilityTripSeats.seatNumber));
  res.json({ ok: true, ...row, seats, remainingSeats: seats.filter((seat) => seat.status === "available" || (seat.status === "held" && seat.holdExpiresAt && seat.holdExpiresAt < new Date())).length });
});

publicApi.post("/bookings/hold", async (req: any, res) => {
  if (!checkRateLimit(req, res, 25)) return;
  const parsed = holdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Réservation invalide.", issues: parsed.error.flatten() });
  const tenantId = req.mobilityTenantId as number;
  const { tripId, passengerCount } = parsed.data;
  const accessToken = makeToken();
  const reference = makeReference("AGJ");
  try {
    const result = await db.transaction(async (tx: any) => {
      await releaseExpiredHolds(tx, tenantId);
      const [trip] = await tx
        .select({ trip: agoojyeMobilityTrips, bus: agoojyeMobilityBuses })
        .from(agoojyeMobilityTrips)
        .innerJoin(agoojyeMobilityBuses, eq(agoojyeMobilityTrips.busId, agoojyeMobilityBuses.id))
        .where(and(eq(agoojyeMobilityTrips.tenantId, tenantId), eq(agoojyeMobilityTrips.id, tripId)))
        .limit(1);
      if (!trip || !isTripBookable({ departureAt: trip.trip.departureAt, status: trip.trip.status, bookingOpen: trip.trip.bookingOpen, remainingSeats: trip.bus.capacity, passengers: passengerCount })) {
        throw new Error("TRIP_NOT_BOOKABLE");
      }
      let requestedSeats = [...new Set(parsed.data.seatNumbers.map((seat) => seat.toUpperCase()))];
      if (!trip.bus.seatSelectionEnabled || !requestedSeats.length) {
        const available = await tx
          .select({ seatNumber: agoojyeMobilityTripSeats.seatNumber })
          .from(agoojyeMobilityTripSeats)
          .where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.tripId, tripId), eq(agoojyeMobilityTripSeats.status, "available")))
          .orderBy(asc(agoojyeMobilityTripSeats.seatNumber))
          .limit(passengerCount);
        requestedSeats = available.map((seat: any) => seat.seatNumber);
      }
      if (requestedSeats.length !== passengerCount) throw new Error("SEAT_COUNT_MISMATCH");
      const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
      const [booking] = await tx
        .insert(agoojyeMobilityBookings)
        .values({
          tenantId,
          tripId,
          reference,
          accessTokenHash: hash(accessToken),
          passengerCount,
          subtotalXof: trip.trip.fareXof * passengerCount,
          feesXof: 0,
          totalXof: trip.trip.fareXof * passengerCount,
          currency: "XOF",
          status: "hold",
          paymentStatus: "unpaid",
          holdExpiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      for (const seatNumber of requestedSeats) {
        const [seat] = await tx
          .update(agoojyeMobilityTripSeats)
          .set({ status: "held", bookingId: booking.id, holdExpiresAt, updatedAt: new Date() })
          .where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.tripId, tripId), eq(agoojyeMobilityTripSeats.seatNumber, seatNumber), eq(agoojyeMobilityTripSeats.status, "available")))
          .returning();
        if (!seat) throw new Error(`SEAT_UNAVAILABLE:${seatNumber}`);
      }
      return { booking, seatNumbers: requestedSeats };
    });
    return res.status(201).json({ ok: true, ...result, accessToken, holdMinutes: HOLD_MINUTES });
  } catch (error: any) {
    const message = clean(error?.message);
    if (message.startsWith("SEAT_UNAVAILABLE")) return res.status(409).json({ message: "Une place vient d'être réservée. Choisissez une autre place.", code: "seat_unavailable" });
    if (message === "SEAT_COUNT_MISMATCH") return res.status(409).json({ message: "Le nombre de places disponibles est insuffisant.", code: "seat_count_mismatch" });
    if (message === "TRIP_NOT_BOOKABLE") return res.status(409).json({ message: "Ce trajet n'est plus disponible à la réservation.", code: "trip_not_bookable" });
    return res.status(500).json({ message: "Impossible de créer la réservation temporaire." });
  }
});

function bookingAccess(req: any) {
  return clean(req.headers["x-booking-token"] || req.body?.accessToken || req.query?.accessToken);
}

async function requireBookingAccess(tenantId: number, reference: string, accessToken: string) {
  if (!accessToken) return null;
  const [booking] = await db.select().from(agoojyeMobilityBookings).where(and(eq(agoojyeMobilityBookings.tenantId, tenantId), eq(agoojyeMobilityBookings.reference, reference), eq(agoojyeMobilityBookings.accessTokenHash, hash(accessToken)))).limit(1);
  return booking || null;
}

publicApi.put("/bookings/:reference/passengers", async (req: any, res) => {
  const tenantId = req.mobilityTenantId as number;
  const booking = await requireBookingAccess(tenantId, req.params.reference, bookingAccess(req));
  if (!booking) return res.status(404).json({ message: "Réservation introuvable ou accès invalide." });
  if (booking.holdExpiresAt && booking.holdExpiresAt <= new Date()) return res.status(410).json({ message: "Cette réservation a expiré." });
  const parsed = z.object({ contactEmail: z.string().trim().email(), contactPhone: z.string().trim().min(6).max(30), passengers: z.array(passengerSchema).min(1).max(8) }).safeParse(req.body);
  if (!parsed.success || parsed.data.passengers.length !== booking.passengerCount) return res.status(400).json({ message: "Informations passagers incomplètes.", issues: parsed.success ? undefined : parsed.error.flatten() });
  const seats = await db.select().from(agoojyeMobilityTripSeats).where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.bookingId, booking.id))).orderBy(asc(agoojyeMobilityTripSeats.seatNumber));
  await db.transaction(async (tx: any) => {
    await tx.delete(agoojyeMobilityBookingPassengers).where(and(eq(agoojyeMobilityBookingPassengers.tenantId, tenantId), eq(agoojyeMobilityBookingPassengers.bookingId, booking.id)));
    await tx.insert(agoojyeMobilityBookingPassengers).values(parsed.data.passengers.map((passenger, index) => ({
      tenantId,
      bookingId: booking.id,
      firstName: passenger.firstName,
      lastName: passenger.lastName,
      phone: passenger.phone || parsed.data.contactPhone,
      email: passenger.email || (index === 0 ? parsed.data.contactEmail : null),
      identificationReference: passenger.identificationReference || null,
      assistanceNote: passenger.assistanceNote || null,
      seatNumber: seats[index]?.seatNumber || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })));
    await tx.update(agoojyeMobilityBookings).set({ contactEmail: parsed.data.contactEmail.toLowerCase(), contactPhone: parsed.data.contactPhone, updatedAt: new Date() }).where(eq(agoojyeMobilityBookings.id, booking.id));
  });
  const payload = await publicBookingPayload(tenantId, booking.id);
  res.json({ ok: true, booking: payload });
});

publicApi.post("/bookings/:reference/payment", async (req: any, res) => {
  if (!checkRateLimit(req, res, 20)) return;
  const tenantId = req.mobilityTenantId as number;
  const booking = await requireBookingAccess(tenantId, req.params.reference, bookingAccess(req));
  if (!booking) return res.status(404).json({ message: "Réservation introuvable ou accès invalide." });
  if (booking.holdExpiresAt && booking.holdExpiresAt <= new Date()) return res.status(410).json({ message: "Cette réservation a expiré." });
  if (booking.paymentStatus === "paid") return res.json({ ok: true, booking: await publicBookingPayload(tenantId, booking.id) });
  const parsed = z.object({ method: z.enum(["mobile_money", "card", "bank_transfer", "cash"]), demoOutcome: z.enum(["success", "pending", "failed"]).default("success") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Mode de paiement invalide." });
  const passengers = await db.select().from(agoojyeMobilityBookingPassengers).where(and(eq(agoojyeMobilityBookingPassengers.tenantId, tenantId), eq(agoojyeMobilityBookingPassengers.bookingId, booking.id))).orderBy(asc(agoojyeMobilityBookingPassengers.id));
  if (passengers.length !== booking.passengerCount) return res.status(409).json({ message: "Ajoutez les informations de tous les passagers avant le paiement." });
  const externalReference = makeReference("PAY-DEMO");
  const paymentState = resolveDemoPaymentState(parsed.data.demoOutcome);
  const paymentStatus = paymentState.paymentStatus;
  await db.transaction(async (tx: any) => {
    const now = new Date();
    await tx.insert(agoojyeMobilityPayments).values({ tenantId, bookingId: booking.id, provider: "demo", method: parsed.data.method, externalReference, amountXof: booking.totalXof, currency: "XOF", status: paymentStatus, demo: true, paidAt: paymentStatus === "paid" ? now : null, metadata: { explicitDemo: true }, createdAt: now, updatedAt: now });
    if (paymentStatus === "failed") {
      await tx.update(agoojyeMobilityBookings).set({ status: "payment_failed", paymentStatus: "failed", updatedAt: now }).where(eq(agoojyeMobilityBookings.id, booking.id));
      await tx.update(agoojyeMobilityTripSeats).set({ status: "available", bookingId: null, holdExpiresAt: null, updatedAt: now }).where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.bookingId, booking.id), eq(agoojyeMobilityTripSeats.status, "held")));
      return;
    }
    if (paymentStatus === "pending") {
      const extended = new Date(Date.now() + 30 * 60_000);
      await tx.update(agoojyeMobilityBookings).set({ status: "pending_payment", paymentStatus: "pending", holdExpiresAt: extended, updatedAt: now }).where(eq(agoojyeMobilityBookings.id, booking.id));
      await tx.update(agoojyeMobilityTripSeats).set({ holdExpiresAt: extended, updatedAt: now }).where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.bookingId, booking.id), eq(agoojyeMobilityTripSeats.status, "held")));
      return;
    }
    await tx.update(agoojyeMobilityBookings).set({ status: "confirmed", paymentStatus: "paid", confirmedAt: now, holdExpiresAt: null, updatedAt: now }).where(eq(agoojyeMobilityBookings.id, booking.id));
    await tx.update(agoojyeMobilityTripSeats).set({ status: "sold", holdExpiresAt: null, updatedAt: now }).where(and(eq(agoojyeMobilityTripSeats.tenantId, tenantId), eq(agoojyeMobilityTripSeats.bookingId, booking.id)));
    for (const passenger of passengers) {
      await tx.insert(agoojyeMobilityTickets).values({ tenantId, bookingId: booking.id, passengerId: passenger.id, tripId: booking.tripId, reference: makeReference("TKT"), publicToken: makeTicketToken(), seatNumber: passenger.seatNumber, status: "active", issuedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing();
    }
  });
  const payload = await publicBookingPayload(tenantId, booking.id);
  res.status(paymentStatus === "paid" ? 201 : 202).json({ ok: true, demo: true, paymentStatus, booking: payload });
});

publicApi.get("/bookings/:reference", async (req: any, res) => {
  const tenantId = req.mobilityTenantId as number;
  const reference = clean(req.params.reference).toUpperCase();
  const accessToken = bookingAccess(req);
  let booking = await requireBookingAccess(tenantId, reference, accessToken);
  if (!booking) {
    const contact = clean(req.query.contact).toLowerCase();
    if (!contact) return res.status(404).json({ message: "Réservation introuvable." });
    const [found] = await db.select().from(agoojyeMobilityBookings).where(and(eq(agoojyeMobilityBookings.tenantId, tenantId), eq(agoojyeMobilityBookings.reference, reference), or(eq(agoojyeMobilityBookings.contactEmail, contact), eq(agoojyeMobilityBookings.contactPhone, contact)))).limit(1);
    booking = found || null;
  }
  if (!booking) return res.status(404).json({ message: "Réservation introuvable." });
  res.json({ ok: true, booking: await publicBookingPayload(tenantId, booking.id) });
});

publicApi.post("/bookings/:reference/cancellation-request", async (req: any, res) => {
  const tenantId = req.mobilityTenantId as number;
  const booking = await requireBookingAccess(tenantId, req.params.reference, bookingAccess(req));
  if (!booking) return res.status(404).json({ message: "Réservation introuvable ou accès invalide." });
  if (!["confirmed", "pending_payment"].includes(booking.status)) return res.status(409).json({ message: "Cette réservation ne peut pas faire l'objet d'une demande d'annulation." });
  await db.update(agoojyeMobilityBookings).set({ cancellationRequestedAt: new Date(), updatedAt: new Date() }).where(eq(agoojyeMobilityBookings.id, booking.id));
  res.json({ ok: true, message: "Votre demande d'annulation a été transmise au support AGOOJIYE." });
});

async function ticketPayload(tenantId: number, token: string) {
  const [row] = await db
    .select({ ticket: agoojyeMobilityTickets, passenger: agoojyeMobilityBookingPassengers, booking: agoojyeMobilityBookings, trip: agoojyeMobilityTrips, route: agoojyeMobilityRoutes, bus: agoojyeMobilityBuses })
    .from(agoojyeMobilityTickets)
    .innerJoin(agoojyeMobilityBookingPassengers, eq(agoojyeMobilityTickets.passengerId, agoojyeMobilityBookingPassengers.id))
    .innerJoin(agoojyeMobilityBookings, eq(agoojyeMobilityTickets.bookingId, agoojyeMobilityBookings.id))
    .innerJoin(agoojyeMobilityTrips, eq(agoojyeMobilityTickets.tripId, agoojyeMobilityTrips.id))
    .innerJoin(agoojyeMobilityRoutes, eq(agoojyeMobilityTrips.routeId, agoojyeMobilityRoutes.id))
    .innerJoin(agoojyeMobilityBuses, eq(agoojyeMobilityTrips.busId, agoojyeMobilityBuses.id))
    .where(and(eq(agoojyeMobilityTickets.tenantId, tenantId), eq(agoojyeMobilityTickets.publicToken, token)))
    .limit(1);
  return row || null;
}

publicApi.get("/tickets/:token", async (req: any, res) => {
  const row = await ticketPayload(req.mobilityTenantId, clean(req.params.token));
  if (!row) return res.status(404).json({ message: "Billet introuvable." });
  res.json({ ok: true, ...row, qrUrl: `${APP_URL}/api/agoojye/mobility/tickets/${row.ticket.publicToken}/qr` });
});

publicApi.get("/tickets/:token/qr", async (req: any, res) => {
  const row = await ticketPayload(req.mobilityTenantId, clean(req.params.token));
  if (!row) return res.status(404).json({ message: "Billet introuvable." });
  const png = await QRCode.toBuffer(`${APP_URL}/billet/${row.ticket.publicToken}`, { width: 420, margin: 2, errorCorrectionLevel: "M" });
  res.setHeader("Cache-Control", "private, max-age=300");
  res.type("png").send(png);
});

const fullBusSchema = z.object({
  customerType: z.string().trim().min(2), organizationName: z.string().trim().max(160).optional(), contactName: z.string().trim().min(3), email: z.string().trim().email(), phone: z.string().trim().min(6), origin: z.string().trim().min(2), destination: z.string().trim().min(2), departureAt: z.string(), returnAt: z.string().optional(), tripType: z.enum(["one-way", "round-trip"]).default("one-way"), passengerCount: z.coerce.number().int().min(1).max(100), preferredBusType: z.string().trim().optional(), purpose: z.string().trim().optional(), accessibilityNeeds: z.string().trim().optional(), notes: z.string().trim().max(2000).optional(), requestAction: z.enum(["quote", "availability"]).default("quote"),
});
const demoRequestSchema = z.object({ requestType: z.string().trim().min(2), fullName: z.string().trim().min(3), organization: z.string().trim().optional(), role: z.string().trim().optional(), email: z.string().trim().email(), phone: z.string().trim().min(6), city: z.string().trim().min(2), preferredDate: z.string().optional(), participantCount: z.coerce.number().int().min(1).max(200).default(1), message: z.string().trim().max(2000).optional() });
const orderSchema = z.object({ organization: z.string().trim().min(2), contactName: z.string().trim().min(3), role: z.string().trim().optional(), email: z.string().trim().email(), phone: z.string().trim().min(6), country: z.string().trim().min(2).default("Bénin"), city: z.string().trim().min(2), quantity: z.coerce.number().int().min(1).max(500), intendedUse: z.string().trim().min(2), expectedCapacity: z.coerce.number().int().min(1).max(100).optional(), desiredDeliveryPeriod: z.string().trim().optional(), budgetRange: z.string().trim().optional(), financingInterest: z.coerce.boolean().default(false), chargingInfrastructureInterest: z.coerce.boolean().default(false), message: z.string().trim().max(3000).optional() });
const waitlistSchema = z.object({ firstName: z.string().trim().min(2), lastName: z.string().trim().min(2), email: z.string().trim().email(), phone: z.string().trim().optional(), city: z.string().trim().optional(), country: z.string().trim().min(2).default("Bénin"), interests: z.array(z.string().trim().min(2)).min(1), consent: z.literal(true) });

publicApi.post("/requests/full-bus", async (req: any, res) => {
  if (!checkRateLimit(req, res, 12)) return;
  const parsed = fullBusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Formulaire incomplet.", issues: parsed.error.flatten() });
  const departureAt = parseDate(parsed.data.departureAt);
  if (!departureAt) return res.status(400).json({ message: "Date de départ invalide." });
  const [item] = await db.insert(agoojyeMobilityBusReservationRequests).values({ ...parsed.data, tenantId: req.mobilityTenantId, reference: makeReference("BUS"), departureAt, returnAt: parsed.data.returnAt ? parseDate(parsed.data.returnAt) : null, organizationName: parsed.data.organizationName || null, preferredBusType: parsed.data.preferredBusType || null, purpose: parsed.data.purpose || null, accessibilityNeeds: parsed.data.accessibilityNeeds || null, notes: parsed.data.notes || null, status: parsed.data.requestAction === "availability" ? "availability-check" : "new", createdAt: new Date(), updatedAt: new Date() }).returning();
  res.status(201).json({ ok: true, reference: item.reference, item });
});

publicApi.post("/requests/demo", async (req: any, res) => {
  if (!checkRateLimit(req, res, 12)) return;
  const parsed = demoRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Formulaire incomplet.", issues: parsed.error.flatten() });
  const [item] = await db.insert(agoojyeMobilityDemoRequests).values({ ...parsed.data, tenantId: req.mobilityTenantId, reference: makeReference("DEMO"), organization: parsed.data.organization || null, role: parsed.data.role || null, preferredDate: parsed.data.preferredDate ? parseDate(parsed.data.preferredDate) : null, message: parsed.data.message || null, status: "new", createdAt: new Date(), updatedAt: new Date() }).returning();
  res.status(201).json({ ok: true, reference: item.reference, item });
});

publicApi.post("/requests/order", async (req: any, res) => {
  if (!checkRateLimit(req, res, 12)) return;
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Formulaire incomplet.", issues: parsed.error.flatten() });
  const [item] = await db.insert(agoojyeMobilityBusOrderRequests).values({ ...parsed.data, tenantId: req.mobilityTenantId, reference: makeReference("CMD"), role: parsed.data.role || null, expectedCapacity: parsed.data.expectedCapacity || null, desiredDeliveryPeriod: parsed.data.desiredDeliveryPeriod || null, budgetRange: parsed.data.budgetRange || null, message: parsed.data.message || null, status: "new", createdAt: new Date(), updatedAt: new Date() }).returning();
  res.status(201).json({ ok: true, reference: item.reference, item });
});

publicApi.post("/waitlist", async (req: any, res) => {
  if (!checkRateLimit(req, res, 12)) return;
  const parsed = waitlistSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Formulaire incomplet ou consentement manquant.", issues: parsed.error.flatten() });
  const [item] = await db.insert(agoojyeMobilityWaitlistEntries).values({ ...parsed.data, tenantId: req.mobilityTenantId, email: parsed.data.email.toLowerCase(), phone: parsed.data.phone || null, city: parsed.data.city || null, status: "active", createdAt: new Date(), updatedAt: new Date() }).onConflictDoUpdate({ target: [agoojyeMobilityWaitlistEntries.tenantId, agoojyeMobilityWaitlistEntries.email], set: { firstName: parsed.data.firstName, lastName: parsed.data.lastName, phone: parsed.data.phone || null, city: parsed.data.city || null, country: parsed.data.country, interests: parsed.data.interests, consent: true, status: "active", updatedAt: new Date() } }).returning();
  res.status(201).json({ ok: true, item });
});

staffApi.use(ensureTenantStaff);
staffApi.use(async (req: any, res, next) => {
  try {
    const tenantId = requireAgoojyeTenant(req, res);
    if (!tenantId) return;
    await ensureMobilitySeed(tenantId);
    req.mobilityTenantId = tenantId;
    next();
  } catch (error) { next(error); }
});

staffApi.get("/trips/today", async (req: any, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  const trips = await db.select({ trip: agoojyeMobilityTrips, route: agoojyeMobilityRoutes, bus: agoojyeMobilityBuses }).from(agoojyeMobilityTrips).innerJoin(agoojyeMobilityRoutes, eq(agoojyeMobilityTrips.routeId, agoojyeMobilityRoutes.id)).innerJoin(agoojyeMobilityBuses, eq(agoojyeMobilityTrips.busId, agoojyeMobilityBuses.id)).where(and(eq(agoojyeMobilityTrips.tenantId, req.mobilityTenantId), gte(agoojyeMobilityTrips.departureAt, start), lt(agoojyeMobilityTrips.departureAt, end))).orderBy(asc(agoojyeMobilityTrips.departureAt));
  res.json({ ok: true, trips });
});

staffApi.get("/trips/:id/manifest", async (req: any, res) => {
  const tenantId = req.mobilityTenantId as number;
  const tripId = Number(req.params.id);
  const manifest = await db
    .select({
      ticket: {
        id: agoojyeMobilityTickets.id,
        reference: agoojyeMobilityTickets.reference,
        seatNumber: agoojyeMobilityTickets.seatNumber,
        status: agoojyeMobilityTickets.status,
      },
      passenger: {
        firstName: agoojyeMobilityBookingPassengers.firstName,
        lastName: agoojyeMobilityBookingPassengers.lastName,
      },
      booking: {
        reference: agoojyeMobilityBookings.reference,
      },
    })
    .from(agoojyeMobilityTickets)
    .innerJoin(
      agoojyeMobilityBookingPassengers,
      eq(agoojyeMobilityTickets.passengerId, agoojyeMobilityBookingPassengers.id),
    )
    .innerJoin(
      agoojyeMobilityBookings,
      eq(agoojyeMobilityTickets.bookingId, agoojyeMobilityBookings.id),
    )
    .where(
      and(
        eq(agoojyeMobilityTickets.tenantId, tenantId),
        eq(agoojyeMobilityTickets.tripId, tripId),
      ),
    )
    .orderBy(asc(agoojyeMobilityBookingPassengers.lastName));
  res.setHeader("Cache-Control", "private, max-age=60");
  res.json({ ok: true, generatedAt: new Date().toISOString(), offlineSnapshot: true, manifest });
});

staffApi.post("/tickets/validate", async (req: any, res) => {
  const parsed = z.object({ token: z.string().trim().min(16), tripId: z.coerce.number().int().positive(), deviceMetadata: z.record(z.unknown()).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Code billet ou trajet invalide.", result: "not_found" });
  const tenantId = req.mobilityTenantId as number;
  const result = await db.transaction(async (tx: any) => {
    const [row] = await tx.select({ ticket: agoojyeMobilityTickets, booking: agoojyeMobilityBookings, trip: agoojyeMobilityTrips }).from(agoojyeMobilityTickets).innerJoin(agoojyeMobilityBookings, eq(agoojyeMobilityTickets.bookingId, agoojyeMobilityBookings.id)).innerJoin(agoojyeMobilityTrips, eq(agoojyeMobilityTickets.tripId, agoojyeMobilityTrips.id)).where(and(eq(agoojyeMobilityTickets.tenantId, tenantId), or(eq(agoojyeMobilityTickets.publicToken, parsed.data.token), eq(agoojyeMobilityTickets.reference, parsed.data.token.toUpperCase())))).limit(1);
    let validationResult = resolveTicketValidation({ found: Boolean(row), ticketStatus: row?.ticket.status, paymentStatus: row?.booking.paymentStatus, ticketTripId: row?.ticket.tripId, selectedTripId: parsed.data.tripId });
    if (!row) return { result: validationResult, ticket: null };
    if (validationResult === "valid") {
      const [updated] = await tx.update(agoojyeMobilityTickets).set({ status: "used", usedAt: new Date(), updatedAt: new Date() }).where(and(eq(agoojyeMobilityTickets.id, row.ticket.id), eq(agoojyeMobilityTickets.status, "active"))).returning();
      if (!updated) validationResult = "already_used";
    }
    await tx.insert(agoojyeMobilityTicketValidations).values({ tenantId, ticketId: row.ticket.id, tripId: parsed.data.tripId, validatorUserId: Number(req.staffUser?.id) || null, result: validationResult, deviceMetadata: parsed.data.deviceMetadata || {}, validatedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    return { result: validationResult, ticket: row.ticket };
  });
  const labels: Record<string, string> = { valid: "Billet valide", already_used: "Billet déjà utilisé", cancelled: "Billet annulé", wrong_trip: "Mauvais trajet", wrong_date: "Mauvaise date", not_found: "Billet introuvable", payment_unconfirmed: "Paiement non confirmé", invalid: "Billet invalide" };
  res.status(result.result === "valid" ? 200 : result.result === "not_found" ? 404 : 409).json({ ok: result.result === "valid", ...result, message: labels[result.result] || "Billet invalide" });
});

adminApi.use(ensureTenantAdmin);
adminApi.use(async (req: any, res, next) => {
  try {
    const tenantId = requireAgoojyeTenant(req, res);
    if (!tenantId) return;
    await ensureMobilitySeed(tenantId);
    req.mobilityTenantId = tenantId;
    next();
  } catch (error) { next(error); }
});

const adminResources: Record<string, { table: any; fields: string[] }> = {
  buses: { table: agoojyeMobilityBuses, fields: ["name", "slug", "reference", "category", "description", "capacity", "seatSelectionEnabled", "seatLayout", "amenities", "rangeKm", "chargingMinutes", "intendedUse", "heroImageUrl", "model3dUrl", "specificationsStatus", "availabilityStatus", "active"] },
  routes: { table: agoojyeMobilityRoutes, fields: ["slug", "origin", "destination", "boardingPoint", "arrivalPoint", "durationMinutes", "baseFareXof", "description", "active"] },
  schedules: { table: agoojyeMobilitySchedules, fields: ["routeId", "busId", "name", "departureTime", "daysOfWeek", "fareXof", "active"] },
  trips: { table: agoojyeMobilityTrips, fields: ["routeId", "busId", "scheduleId", "departureAt", "arrivalAt", "fareXof", "status", "bookingOpen", "notes"] },
  bookings: { table: agoojyeMobilityBookings, fields: ["status", "paymentStatus", "cancellationRequestedAt"] },
  tickets: { table: agoojyeMobilityTickets, fields: ["status", "seatNumber"] },
  payments: { table: agoojyeMobilityPayments, fields: ["status", "refundedAt"] },
  "bus-requests": { table: agoojyeMobilityBusReservationRequests, fields: ["status", "internalNotes"] },
  demonstrations: { table: agoojyeMobilityDemoRequests, fields: ["status", "internalNotes"] },
  orders: { table: agoojyeMobilityBusOrderRequests, fields: ["status", "internalNotes"] },
  waitlist: { table: agoojyeMobilityWaitlistEntries, fields: ["status", "interests"] },
  validations: { table: agoojyeMobilityTicketValidations, fields: [] },
};

adminApi.get("/dashboard", async (req: any, res) => {
  const tenantId = req.mobilityTenantId as number;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const [tripsToday, ticketsSold, revenue, activeBookings, pendingBus, pendingDemos, pendingOrders, recentPayments, recentValidations] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityTrips).where(and(eq(agoojyeMobilityTrips.tenantId, tenantId), gte(agoojyeMobilityTrips.departureAt, today), lt(agoojyeMobilityTrips.departureAt, tomorrow))),
    db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityTickets).where(and(eq(agoojyeMobilityTickets.tenantId, tenantId), gte(agoojyeMobilityTickets.issuedAt, today))),
    db.select({ total: sql<number>`coalesce(sum(${agoojyeMobilityPayments.amountXof}), 0)` }).from(agoojyeMobilityPayments).where(and(eq(agoojyeMobilityPayments.tenantId, tenantId), eq(agoojyeMobilityPayments.status, "paid"), gte(agoojyeMobilityPayments.paidAt, today))),
    db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityBookings).where(and(eq(agoojyeMobilityBookings.tenantId, tenantId), inArray(agoojyeMobilityBookings.status, ["hold", "pending_payment", "confirmed"]))),
    db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityBusReservationRequests).where(and(eq(agoojyeMobilityBusReservationRequests.tenantId, tenantId), inArray(agoojyeMobilityBusReservationRequests.status, ["new", "availability-check"]))),
    db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityDemoRequests).where(and(eq(agoojyeMobilityDemoRequests.tenantId, tenantId), eq(agoojyeMobilityDemoRequests.status, "new"))),
    db.select({ count: sql<number>`count(*)` }).from(agoojyeMobilityBusOrderRequests).where(and(eq(agoojyeMobilityBusOrderRequests.tenantId, tenantId), eq(agoojyeMobilityBusOrderRequests.status, "new"))),
    db.select().from(agoojyeMobilityPayments).where(eq(agoojyeMobilityPayments.tenantId, tenantId)).orderBy(desc(agoojyeMobilityPayments.createdAt)).limit(10),
    db.select().from(agoojyeMobilityTicketValidations).where(eq(agoojyeMobilityTicketValidations.tenantId, tenantId)).orderBy(desc(agoojyeMobilityTicketValidations.validatedAt)).limit(10),
  ]);
  res.json({ ok: true, metrics: { tripsToday: Number(tripsToday[0]?.count || 0), ticketsSoldToday: Number(ticketsSold[0]?.count || 0), revenueTodayXof: Number(revenue[0]?.total || 0), activeBookings: Number(activeBookings[0]?.count || 0), pendingFullBusRequests: Number(pendingBus[0]?.count || 0), pendingDemonstrations: Number(pendingDemos[0]?.count || 0), pendingOrders: Number(pendingOrders[0]?.count || 0) }, recentPayments, recentValidations });
});

adminApi.get("/:resource", async (req: any, res) => {
  const resource = adminResources[req.params.resource];
  if (!resource) return res.status(404).json({ message: "Ressource mobilité inconnue." });
  const items = await db.select().from(resource.table).where(eq(resource.table.tenantId, req.mobilityTenantId)).orderBy(desc(resource.table.createdAt)).limit(500);
  res.json({ ok: true, items });
});

adminApi.post("/:resource", async (req: any, res) => {
  const resource = adminResources[req.params.resource];
  if (!resource || !["buses", "routes", "schedules", "trips"].includes(req.params.resource)) return res.status(404).json({ message: "Création non disponible pour cette ressource." });
  const values: Record<string, unknown> = { tenantId: req.mobilityTenantId, createdAt: new Date(), updatedAt: new Date() };
  for (const field of resource.fields) if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) values[field] = req.body[field];
  let tripBusCapacity: number | null = null;
  if (req.params.resource === "trips") {
    values.departureAt = parseDate(values.departureAt);
    values.arrivalAt = parseDate(values.arrivalAt);
    if (!values.departureAt || !values.arrivalAt || !Number(values.busId) || !Number(values.routeId)) return res.status(400).json({ message: "Bus, ligne, départ et arrivée sont requis." });
    const [busRows, routeRows] = await Promise.all([
      db.select({ capacity: agoojyeMobilityBuses.capacity }).from(agoojyeMobilityBuses).where(and(eq(agoojyeMobilityBuses.tenantId, req.mobilityTenantId), eq(agoojyeMobilityBuses.id, Number(values.busId)))).limit(1),
      db.select({ id: agoojyeMobilityRoutes.id }).from(agoojyeMobilityRoutes).where(and(eq(agoojyeMobilityRoutes.tenantId, req.mobilityTenantId), eq(agoojyeMobilityRoutes.id, Number(values.routeId)))).limit(1),
    ]);
    if (!busRows[0] || !routeRows[0]) return res.status(400).json({ message: "Bus ou ligne introuvable pour ce tenant." });
    tripBusCapacity = busRows[0].capacity;
  }
  const inserted = (await db.insert(resource.table).values(values).returning()) as any[];
  const item = inserted[0];
  if (req.params.resource === "trips" && item?.id && tripBusCapacity) {
    await db.insert(agoojyeMobilityTripSeats).values(seatLabels(tripBusCapacity).map((seatNumber) => ({ tenantId: req.mobilityTenantId, tripId: item.id, seatNumber, status: "available", createdAt: new Date(), updatedAt: new Date() }))).onConflictDoNothing();
  }
  res.status(201).json({ ok: true, item });
});

adminApi.patch("/:resource/:id", async (req: any, res) => {
  const resource = adminResources[req.params.resource];
  const id = Number(req.params.id);
  if (!resource || !id) return res.status(404).json({ message: "Ressource mobilité inconnue." });
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of resource.fields) if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) patch[field] = req.body[field];
  if (Object.keys(patch).length === 1) return res.status(400).json({ message: "Aucun champ modifiable fourni." });
  if (Object.prototype.hasOwnProperty.call(patch, "departureAt")) patch.departureAt = parseDate(patch.departureAt);
  if (Object.prototype.hasOwnProperty.call(patch, "arrivalAt")) patch.arrivalAt = parseDate(patch.arrivalAt);
  const [item] = await db.update(resource.table).set(patch).where(and(eq(resource.table.tenantId, req.mobilityTenantId), eq(resource.table.id, id))).returning();
  if (!item) return res.status(404).json({ message: "Élément introuvable." });
  res.json({ ok: true, item });
});

router.use("/api/agoojye/mobility", publicApi);
router.use("/api/agoojye/staff", staffApi);
router.use("/api/admin/agoojye/mobility", adminApi);

export default router;
