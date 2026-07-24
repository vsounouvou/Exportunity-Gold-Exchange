BEGIN;

CREATE TABLE IF NOT EXISTS agoojye_mobility_buses (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  reference text NOT NULL,
  category text NOT NULL,
  description text,
  capacity integer NOT NULL CHECK (capacity > 0),
  seat_selection_enabled boolean NOT NULL DEFAULT true,
  seat_layout jsonb NOT NULL,
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  range_km integer,
  charging_minutes integer,
  intended_use text,
  hero_image_url text,
  model_3d_url text,
  specifications_status text NOT NULL DEFAULT 'placeholder',
  availability_status text NOT NULL DEFAULT 'available',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_buses_tenant_slug_uidx UNIQUE (tenant_id, slug),
  CONSTRAINT agoojye_mobility_buses_tenant_reference_uidx UNIQUE (tenant_id, reference)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_buses_tenant_status_idx ON agoojye_mobility_buses (tenant_id, active, availability_status);

CREATE TABLE IF NOT EXISTS agoojye_mobility_bus_images (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bus_id integer NOT NULL REFERENCES agoojye_mobility_buses(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text NOT NULL,
  kind text NOT NULL DEFAULT 'gallery',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_bus_images_bus_idx ON agoojye_mobility_bus_images (tenant_id, bus_id, sort_order);

CREATE TABLE IF NOT EXISTS agoojye_mobility_bus_specifications (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bus_id integer NOT NULL REFERENCES agoojye_mobility_buses(id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL,
  unit text,
  verified boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_bus_specs_tenant_bus_label_uidx UNIQUE (tenant_id, bus_id, label)
);

CREATE TABLE IF NOT EXISTS agoojye_mobility_routes (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  boarding_point text NOT NULL,
  arrival_point text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  base_fare_xof integer NOT NULL CHECK (base_fare_xof >= 0),
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_routes_tenant_slug_uidx UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_routes_tenant_cities_idx ON agoojye_mobility_routes (tenant_id, origin, destination, active);

CREATE TABLE IF NOT EXISTS agoojye_mobility_stops (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text NOT NULL,
  address text,
  latitude text,
  longitude text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_stops_tenant_name_uidx UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS agoojye_mobility_route_stops (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  route_id integer NOT NULL REFERENCES agoojye_mobility_routes(id) ON DELETE CASCADE,
  stop_id integer NOT NULL REFERENCES agoojye_mobility_stops(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  offset_minutes integer NOT NULL DEFAULT 0,
  boarding_allowed boolean NOT NULL DEFAULT true,
  dropoff_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_route_stops_tenant_route_order_uidx UNIQUE (tenant_id, route_id, sort_order)
);

CREATE TABLE IF NOT EXISTS agoojye_mobility_schedules (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  route_id integer NOT NULL REFERENCES agoojye_mobility_routes(id) ON DELETE CASCADE,
  bus_id integer NOT NULL REFERENCES agoojye_mobility_buses(id) ON DELETE RESTRICT,
  name text NOT NULL,
  departure_time text NOT NULL,
  days_of_week jsonb NOT NULL DEFAULT '[]'::jsonb,
  fare_xof integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_schedules_tenant_route_idx ON agoojye_mobility_schedules (tenant_id, route_id, active);

CREATE TABLE IF NOT EXISTS agoojye_mobility_trips (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  route_id integer NOT NULL REFERENCES agoojye_mobility_routes(id) ON DELETE RESTRICT,
  bus_id integer NOT NULL REFERENCES agoojye_mobility_buses(id) ON DELETE RESTRICT,
  schedule_id integer REFERENCES agoojye_mobility_schedules(id) ON DELETE SET NULL,
  departure_at timestamptz NOT NULL,
  arrival_at timestamptz NOT NULL,
  fare_xof integer NOT NULL CHECK (fare_xof >= 0),
  status text NOT NULL DEFAULT 'scheduled',
  booking_open boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_trips_tenant_route_departure_uidx UNIQUE (tenant_id, route_id, departure_at)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_trips_tenant_departure_idx ON agoojye_mobility_trips (tenant_id, departure_at, status);

CREATE TABLE IF NOT EXISTS agoojye_mobility_bookings (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trip_id integer NOT NULL REFERENCES agoojye_mobility_trips(id) ON DELETE RESTRICT,
  reference text NOT NULL,
  access_token_hash text NOT NULL,
  contact_email text,
  contact_phone text,
  passenger_count integer NOT NULL CHECK (passenger_count BETWEEN 1 AND 8),
  subtotal_xof integer NOT NULL CHECK (subtotal_xof >= 0),
  fees_xof integer NOT NULL DEFAULT 0 CHECK (fees_xof >= 0),
  total_xof integer NOT NULL CHECK (total_xof >= 0),
  currency text NOT NULL DEFAULT 'XOF',
  status text NOT NULL DEFAULT 'hold',
  payment_status text NOT NULL DEFAULT 'unpaid',
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  cancellation_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_bookings_tenant_reference_uidx UNIQUE (tenant_id, reference),
  CONSTRAINT agoojye_mobility_bookings_access_token_uidx UNIQUE (access_token_hash)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_bookings_tenant_trip_idx ON agoojye_mobility_bookings (tenant_id, trip_id, status);
CREATE INDEX IF NOT EXISTS agoojye_mobility_bookings_tenant_contact_idx ON agoojye_mobility_bookings (tenant_id, contact_email, contact_phone);

CREATE TABLE IF NOT EXISTS agoojye_mobility_trip_seats (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trip_id integer NOT NULL REFERENCES agoojye_mobility_trips(id) ON DELETE CASCADE,
  booking_id integer REFERENCES agoojye_mobility_bookings(id) ON DELETE SET NULL,
  seat_number text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  hold_expires_at timestamptz,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_trip_seats_tenant_trip_seat_uidx UNIQUE (tenant_id, trip_id, seat_number)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_trip_seats_tenant_trip_status_idx ON agoojye_mobility_trip_seats (tenant_id, trip_id, status);

CREATE TABLE IF NOT EXISTS agoojye_mobility_booking_passengers (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id integer NOT NULL REFERENCES agoojye_mobility_bookings(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  email text,
  identification_reference text,
  assistance_note text,
  seat_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_passengers_booking_idx ON agoojye_mobility_booking_passengers (tenant_id, booking_id);

CREATE TABLE IF NOT EXISTS agoojye_mobility_payments (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id integer NOT NULL REFERENCES agoojye_mobility_bookings(id) ON DELETE CASCADE,
  provider text NOT NULL,
  method text NOT NULL,
  external_reference text NOT NULL,
  amount_xof integer NOT NULL CHECK (amount_xof >= 0),
  currency text NOT NULL DEFAULT 'XOF',
  status text NOT NULL DEFAULT 'pending',
  demo boolean NOT NULL DEFAULT true,
  paid_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_payments_tenant_external_uidx UNIQUE (tenant_id, external_reference)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_payments_tenant_booking_idx ON agoojye_mobility_payments (tenant_id, booking_id, status);

CREATE TABLE IF NOT EXISTS agoojye_mobility_tickets (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id integer NOT NULL REFERENCES agoojye_mobility_bookings(id) ON DELETE CASCADE,
  passenger_id integer NOT NULL REFERENCES agoojye_mobility_booking_passengers(id) ON DELETE CASCADE,
  trip_id integer NOT NULL REFERENCES agoojye_mobility_trips(id) ON DELETE RESTRICT,
  reference text NOT NULL,
  public_token text NOT NULL,
  seat_number text,
  status text NOT NULL DEFAULT 'active',
  issued_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_tickets_tenant_reference_uidx UNIQUE (tenant_id, reference),
  CONSTRAINT agoojye_mobility_tickets_public_token_uidx UNIQUE (public_token),
  CONSTRAINT agoojye_mobility_tickets_passenger_uidx UNIQUE (passenger_id)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_tickets_tenant_trip_idx ON agoojye_mobility_tickets (tenant_id, trip_id, status);

CREATE TABLE IF NOT EXISTS agoojye_mobility_ticket_validations (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id integer NOT NULL REFERENCES agoojye_mobility_tickets(id) ON DELETE CASCADE,
  trip_id integer NOT NULL REFERENCES agoojye_mobility_trips(id) ON DELETE RESTRICT,
  validator_user_id integer,
  result text NOT NULL,
  device_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  validated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_validations_ticket_idx ON agoojye_mobility_ticket_validations (tenant_id, ticket_id, validated_at);

CREATE TABLE IF NOT EXISTS agoojye_mobility_bus_reservation_requests (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference text NOT NULL,
  customer_type text NOT NULL,
  organization_name text,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  departure_at timestamptz NOT NULL,
  return_at timestamptz,
  trip_type text NOT NULL DEFAULT 'one-way',
  passenger_count integer NOT NULL CHECK (passenger_count > 0),
  preferred_bus_type text,
  purpose text,
  accessibility_needs text,
  notes text,
  request_action text NOT NULL DEFAULT 'quote',
  status text NOT NULL DEFAULT 'new',
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_bus_requests_tenant_reference_uidx UNIQUE (tenant_id, reference)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_bus_requests_tenant_status_idx ON agoojye_mobility_bus_reservation_requests (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS agoojye_mobility_demo_requests (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference text NOT NULL,
  request_type text NOT NULL,
  full_name text NOT NULL,
  organization text,
  role text,
  email text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  preferred_date timestamptz,
  participant_count integer NOT NULL DEFAULT 1,
  message text,
  status text NOT NULL DEFAULT 'new',
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_demo_requests_tenant_reference_uidx UNIQUE (tenant_id, reference)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_demo_requests_tenant_status_idx ON agoojye_mobility_demo_requests (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS agoojye_mobility_bus_order_requests (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference text NOT NULL,
  organization text NOT NULL,
  contact_name text NOT NULL,
  role text,
  email text NOT NULL,
  phone text NOT NULL,
  country text NOT NULL DEFAULT 'Benin',
  city text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  intended_use text NOT NULL,
  expected_capacity integer,
  desired_delivery_period text,
  budget_range text,
  financing_interest boolean NOT NULL DEFAULT false,
  charging_infrastructure_interest boolean NOT NULL DEFAULT false,
  message text,
  status text NOT NULL DEFAULT 'new',
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_orders_tenant_reference_uidx UNIQUE (tenant_id, reference)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_orders_tenant_status_idx ON agoojye_mobility_bus_order_requests (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS agoojye_mobility_waitlist_entries (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  city text,
  country text NOT NULL DEFAULT 'Benin',
  interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  consent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agoojye_mobility_waitlist_tenant_email_uidx UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS agoojye_mobility_waitlist_tenant_status_idx ON agoojye_mobility_waitlist_entries (tenant_id, status, created_at);

COMMIT;
