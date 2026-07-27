import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { filterTripSearch, isTripBookable, resolveDemoPaymentState, resolveTicketValidation } from "../server/lib/agoojye/mobility-domain";

const now = new Date("2026-07-12T08:00:00.000Z");

test("trip search filters route, date and passenger capacity", () => {
  const records = [
    { origin: "Cotonou", destination: "Porto-Novo", departureAt: "2026-07-13T09:00:00.000Z", status: "scheduled", bookingOpen: true, remainingSeats: 8 },
    { origin: "Cotonou", destination: "Ouidah", departureAt: "2026-07-13T10:00:00.000Z", status: "scheduled", bookingOpen: true, remainingSeats: 8 },
    { origin: "Cotonou", destination: "Porto-Novo", departureAt: "2026-07-13T11:00:00.000Z", status: "scheduled", bookingOpen: true, remainingSeats: 1 },
  ];
  const result = filterTripSearch(records, { origin: "Cotonou", destination: "Porto-Novo", date: "2026-07-13", passengers: 2, now });
  assert.equal(result.length, 1);
  assert.equal(result[0].remainingSeats, 8);
});

test("seat availability rejects full, cancelled, departed and closed trips", () => {
  assert.equal(isTripBookable({ departureAt: "2026-07-13T09:00:00.000Z", status: "scheduled", bookingOpen: true, remainingSeats: 2, passengers: 2, now }), true);
  assert.equal(isTripBookable({ departureAt: "2026-07-13T09:00:00.000Z", status: "cancelled", bookingOpen: true, remainingSeats: 2, passengers: 1, now }), false);
  assert.equal(isTripBookable({ departureAt: "2026-07-11T09:00:00.000Z", status: "scheduled", bookingOpen: true, remainingSeats: 2, passengers: 1, now }), false);
  assert.equal(isTripBookable({ departureAt: "2026-07-13T09:00:00.000Z", status: "scheduled", bookingOpen: false, remainingSeats: 2, passengers: 1, now }), false);
  assert.equal(isTripBookable({ departureAt: "2026-07-13T09:00:00.000Z", status: "scheduled", bookingOpen: true, remainingSeats: 1, passengers: 2, now }), false);
});

test("payment transitions keep pending seats held and release failed seats", () => {
  assert.deepEqual(resolveDemoPaymentState("success"), { paymentStatus: "paid", bookingStatus: "confirmed", seatsStatus: "sold" });
  assert.deepEqual(resolveDemoPaymentState("pending"), { paymentStatus: "pending", bookingStatus: "pending_payment", seatsStatus: "held" });
  assert.deepEqual(resolveDemoPaymentState("failed"), { paymentStatus: "failed", bookingStatus: "payment_failed", seatsStatus: "available" });
});

test("ticket validation prevents duplicate boarding and rejects wrong trip", () => {
  assert.equal(resolveTicketValidation({ found: true, ticketStatus: "active", paymentStatus: "paid", ticketTripId: 10, selectedTripId: 10 }), "valid");
  assert.equal(resolveTicketValidation({ found: true, ticketStatus: "used", paymentStatus: "paid", ticketTripId: 10, selectedTripId: 10 }), "already_used");
  assert.equal(resolveTicketValidation({ found: true, ticketStatus: "active", paymentStatus: "paid", ticketTripId: 10, selectedTripId: 11 }), "wrong_trip");
  assert.equal(resolveTicketValidation({ found: true, ticketStatus: "active", paymentStatus: "pending", ticketTripId: 10, selectedTripId: 10 }), "payment_unconfirmed");
  assert.equal(resolveTicketValidation({ found: false, selectedTripId: 10 }), "not_found");
});

test("database and transaction guards prevent duplicate seat allocation", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const migration = fs.readFileSync(path.join(root, "db", "migrations", "20260712_agoojiye_mobility_platform.sql"), "utf8");
  const route = fs.readFileSync(path.join(root, "server", "routes", "agoojye-mobility.ts"), "utf8");
  assert.match(migration, /UNIQUE \(tenant_id, trip_id, seat_number\)/);
  assert.match(route, /eq\(agoojyeMobilityTripSeats\.status, "available"\)/);
  assert.match(route, /db\.transaction\(async \(tx/);
});

test("ticket QR stores only an opaque token URL", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const route = fs.readFileSync(path.join(root, "server", "routes", "agoojye-mobility.ts"), "utf8");
  assert.match(route, /\/billet\/\$\{row\.ticket\.publicToken\}/);
  assert.doesNotMatch(route, /\/billet\/\$\{row\.passenger\./);
});

test("booking, ticket and commercial request persistence are wired", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const route = fs.readFileSync(path.join(root, "server", "routes", "agoojye-mobility.ts"), "utf8");
  assert.match(route, /publicApi\.post\("\/bookings\/hold"/);
  assert.match(route, /insert\(agoojyeMobilityBookings\)/);
  assert.match(route, /insert\(agoojyeMobilityTickets\)/);
  assert.match(route, /publicApi\.post\("\/requests\/full-bus"/);
  assert.match(route, /insert\(agoojyeMobilityBusReservationRequests\)/);
});

test("admin and controller APIs enforce server-side authorization", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const route = fs.readFileSync(path.join(root, "server", "routes", "agoojye-mobility.ts"), "utf8");
  assert.match(route, /staffApi\.use\(ensureTenantStaff\)/);
  assert.match(route, /adminApi\.use\(ensureTenantAdmin\)/);
  assert.match(route, /requireAgoojyeTenant\(req, res\)/);
});

test("controller manifest exposes only boarding fields", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const routeSource = fs.readFileSync(path.join(root, "server/routes/agoojye-mobility.ts"), "utf8");
  const manifestRoute = routeSource.slice(
    routeSource.indexOf('staffApi.get("/trips/:id/manifest"'),
    routeSource.indexOf('staffApi.post("/tickets/validate"'),
  );
  assert.match(manifestRoute, /firstName: agoojyeMobilityBookingPassengers\.firstName/);
  assert.match(manifestRoute, /reference: agoojyeMobilityTickets\.reference/);
  assert.doesNotMatch(manifestRoute, /publicToken:/);
  assert.doesNotMatch(manifestRoute, /phone:/);
  assert.doesNotMatch(manifestRoute, /email:/);
});

test("mobility administration keeps contact and status values out of date formatting", () => {
  const source = fs.readFileSync(
    new URL("../client/src/pages/agoojye/AgoojiyeMobilityAdmin.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /dateColumns\.has\(key\)/);
  assert.doesNotMatch(source, /key\.toLowerCase\(\)\.includes\("at"\)/);
  assert.match(source, /Enregistrer le statut de l'élément/);
  assert.match(source, /contactEmail: "E-mail"/);
  assert.match(source, /Administration équipe/);
});

test("the 3D viewer adjusts exterior camera framing for narrow mobile canvases", () => {
  const viewerSource = fs.readFileSync(
    new URL("../client/src/pages/agoojye/AgoojiyeThreeExperience.tsx", import.meta.url),
    "utf8",
  );
  assert.match(viewerSource, /camera\.aspect < 1/);
  assert.match(viewerSource, /mobileFramingScale/);
  assert.match(viewerSource, /applyPreset\(runtimeRef\.current\?\.preset \|\| "exterior"\)/);
});
