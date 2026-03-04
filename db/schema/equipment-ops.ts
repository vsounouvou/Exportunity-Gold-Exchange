import { relations } from "drizzle-orm";
import { bigint, boolean, decimal, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export type EquipmentCondition = "new" | "refurbished" | "used" | "broken";
export type EquipmentStatus =
  | "available"
  | "reserved"
  | "deployed"
  | "in_maintenance"
  | "unavailable"
  | "sold";

export type EquipmentListingType = "rent" | "sale" | "fix_and_rent" | "rent_to_own";
export type EquipmentListingVisibility = "public" | "pro_only" | "territory_only";
export type EquipmentListingStatus = "draft" | "published" | "paused" | "closed";

export type EquipmentContractType = "rental" | "sale" | "rent_to_own";
export type EquipmentEscrowStatus = "none" | "holding" | "released" | "partial";
export type EquipmentPaymentStatus = "unpaid" | "partial" | "paid";
export type EquipmentContractStatus = "pending" | "active" | "completed" | "cancelled" | "defaulted";
export type EquipmentESignStatus = "pending" | "signed";

export type EquipmentDispatchStatus = "scheduled" | "in_transit" | "delivered";
export type EquipmentReturnStatus = "not_due" | "due" | "overdue" | "returned";

export type MaintenanceSeverity = "low" | "med" | "high" | "critical";
export type MaintenanceStatus = "open" | "quoted" | "approved" | "in_progress" | "done" | "closed";

export type EquipmentPayoutStatus = "pending" | "available" | "paid";

export const equipment = pgTable("equipment", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),

  ownerUserId: integer("owner_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
  ownerOrgId: integer("owner_org_id"),

  category: text("category").notNull(),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  serialNumber: text("serial_number"),

  condition: text("condition").$type<EquipmentCondition>().notNull().default("used"),
  currentStatus: text("current_status").$type<EquipmentStatus>().notNull().default("available"),

  currentLocationLat: decimal("current_location_lat", { precision: 10, scale: 7 }),
  currentLocationLng: decimal("current_location_lng", { precision: 10, scale: 7 }),
  currentRegionId: integer("current_region_id"),
  currentCountryId: integer("current_country_id"),

  photos: jsonb("photos").$type<string[]>().notNull().default([]),
  documents: jsonb("documents").$type<Record<string, any>>().notNull().default({}),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const equipmentListings = pgTable("equipment_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  equipmentId: uuid("equipment_id")
    .references(() => equipment.id, { onDelete: "cascade" })
    .notNull(),

  listingType: text("listing_type").$type<EquipmentListingType>().notNull(),
  title: text("title").notNull(),
  description: text("description"),

  priceSale: decimal("price_sale", { precision: 12, scale: 2 }),
  priceDay: decimal("price_day", { precision: 12, scale: 2 }),
  priceWeek: decimal("price_week", { precision: 12, scale: 2 }),
  priceMonth: decimal("price_month", { precision: 12, scale: 2 }),

  depositAmount: decimal("deposit_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  minRentalDays: integer("min_rental_days").notNull().default(1),
  includedHoursPerDay: integer("included_hours_per_day"),
  overtimeRate: decimal("overtime_rate", { precision: 12, scale: 2 }),

  deliverySupported: boolean("delivery_supported").notNull().default(false),
  deliveryRadiusKm: integer("delivery_radius_km"),

  operatorIncluded: boolean("operator_included").notNull().default(false),
  operatorDailyCost: decimal("operator_daily_cost", { precision: 12, scale: 2 }),

  availabilityCalendar: jsonb("availability_calendar").$type<Record<string, any>>().notNull().default({}),
  visibility: text("visibility").$type<EquipmentListingVisibility>().notNull().default("public"),
  status: text("status").$type<EquipmentListingStatus>().notNull().default("draft"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const equipmentContracts = pgTable("equipment_contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),

  contractType: text("contract_type").$type<EquipmentContractType>().notNull(),
  listingId: uuid("listing_id").references(() => equipmentListings.id, { onDelete: "set null" }),
  equipmentId: uuid("equipment_id")
    .references(() => equipment.id, { onDelete: "set null" })
    .notNull(),

  clientUserId: integer("client_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
  ownerUserId: integer("owner_user_id").references(() => eceUsers.id, { onDelete: "set null" }),
  ownerOrgId: integer("owner_org_id"),

  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  pricingSummary: jsonb("pricing_summary").$type<Record<string, any>>().notNull().default({}),

  depositAmount: decimal("deposit_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  escrowStatus: text("escrow_status").$type<EquipmentEscrowStatus>().notNull().default("none"),
  paymentStatus: text("payment_status").$type<EquipmentPaymentStatus>().notNull().default("unpaid"),
  contractStatus: text("contract_status").$type<EquipmentContractStatus>().notNull().default("pending"),
  eSignStatus: text("e_sign_status").$type<EquipmentESignStatus>().notNull().default("pending"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const equipmentDeployments = pgTable("equipment_deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  contractId: uuid("contract_id")
    .references(() => equipmentContracts.id, { onDelete: "cascade" })
    .notNull(),

  siteId: text("site_id"),
  siteLat: decimal("site_lat", { precision: 10, scale: 7 }),
  siteLng: decimal("site_lng", { precision: 10, scale: 7 }),

  dispatchStatus: text("dispatch_status").$type<EquipmentDispatchStatus>().notNull().default("scheduled"),
  deliveredAt: timestamp("delivered_at"),

  returnStatus: text("return_status").$type<EquipmentReturnStatus>().notNull().default("not_due"),
  returnedAt: timestamp("returned_at"),

  checklists: jsonb("checklists").$type<Record<string, any>>().notNull().default({}),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const equipmentTelemetry = pgTable("equipment_telemetry", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  equipmentId: uuid("equipment_id")
    .references(() => equipment.id, { onDelete: "cascade" })
    .notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  lat: decimal("lat", { precision: 10, scale: 7 }),
  lng: decimal("lng", { precision: 10, scale: 7 }),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const maintenanceTickets = pgTable("maintenance_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  equipmentId: uuid("equipment_id")
    .references(() => equipment.id, { onDelete: "cascade" })
    .notNull(),
  deploymentId: uuid("deployment_id").references(() => equipmentDeployments.id, { onDelete: "set null" }),

  severity: text("severity").$type<MaintenanceSeverity>().notNull().default("low"),
  issueType: text("issue_type"),
  description: text("description"),
  photos: jsonb("photos").$type<string[]>().notNull().default([]),

  status: text("status").$type<MaintenanceStatus>().notNull().default("open"),
  assignedTechId: integer("assigned_tech_id").references(() => eceUsers.id, { onDelete: "set null" }),

  quoteAmount: decimal("quote_amount", { precision: 12, scale: 2 }),
  approvedAt: timestamp("approved_at"),
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const payoutsLedger = pgTable("equipment_payouts_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: integer("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  contractId: uuid("contract_id").references(() => equipmentContracts.id, { onDelete: "set null" }),
  ownerUserId: integer("owner_user_id").references(() => eceUsers.id, { onDelete: "set null" }),

  grossAmount: bigint("gross_amount", { mode: "number" }).notNull(),
  platformFee: bigint("platform_fee", { mode: "number" }).notNull().default(0),
  maintenanceHold: bigint("maintenance_hold", { mode: "number" }).notNull().default(0),
  netAmount: bigint("net_amount", { mode: "number" }).notNull(),

  payoutStatus: text("payout_status").$type<EquipmentPayoutStatus>().notNull().default("pending"),
  payoutMethod: text("payout_method"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const equipmentRelations = relations(equipment, ({ many, one }) => ({
  tenant: one(tenants, { fields: [equipment.tenantId], references: [tenants.id] }),
  owner: one(eceUsers, { fields: [equipment.ownerUserId], references: [eceUsers.id] }),
  listings: many(equipmentListings),
  telemetry: many(equipmentTelemetry),
  maintenance: many(maintenanceTickets),
}));

export const equipmentListingsRelations = relations(equipmentListings, ({ one, many }) => ({
  tenant: one(tenants, { fields: [equipmentListings.tenantId], references: [tenants.id] }),
  equipment: one(equipment, { fields: [equipmentListings.equipmentId], references: [equipment.id] }),
  contracts: many(equipmentContracts),
}));

export const equipmentContractsRelations = relations(equipmentContracts, ({ one, many }) => ({
  tenant: one(tenants, { fields: [equipmentContracts.tenantId], references: [tenants.id] }),
  equipment: one(equipment, { fields: [equipmentContracts.equipmentId], references: [equipment.id] }),
  listing: one(equipmentListings, { fields: [equipmentContracts.listingId], references: [equipmentListings.id] }),
  client: one(eceUsers, { fields: [equipmentContracts.clientUserId], references: [eceUsers.id] }),
  owner: one(eceUsers, { fields: [equipmentContracts.ownerUserId], references: [eceUsers.id] }),
  deployments: many(equipmentDeployments),
}));

export const equipmentDeploymentsRelations = relations(equipmentDeployments, ({ one, many }) => ({
  tenant: one(tenants, { fields: [equipmentDeployments.tenantId], references: [tenants.id] }),
  contract: one(equipmentContracts, { fields: [equipmentDeployments.contractId], references: [equipmentContracts.id] }),
  maintenance: many(maintenanceTickets),
}));

export const maintenanceTicketsRelations = relations(maintenanceTickets, ({ one }) => ({
  tenant: one(tenants, { fields: [maintenanceTickets.tenantId], references: [tenants.id] }),
  equipment: one(equipment, { fields: [maintenanceTickets.equipmentId], references: [equipment.id] }),
  deployment: one(equipmentDeployments, { fields: [maintenanceTickets.deploymentId], references: [equipmentDeployments.id] }),
  technician: one(eceUsers, { fields: [maintenanceTickets.assignedTechId], references: [eceUsers.id] }),
}));

