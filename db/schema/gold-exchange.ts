import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, decimal, pgEnum } from "drizzle-orm/pg-core";
import { eceUsers } from "./ece";
import { tenants } from "./tenants";

export const goldOrderStatusEnum = pgEnum('gold_order_status', [
  'pending', 'confirmed', 'escrow_locked', 'in_collection', 'collected', 
  'in_assay', 'assayed', 'in_customs', 'customs_cleared', 'in_transit', 
  'arrived', 'delivered', 'payment_released', 'completed', 'cancelled', 'disputed'
]);

export const goldDeliveryStepEnum = pgEnum('gold_delivery_step', [
  'order_confirmed', 'seller_preparing', 'pickup_scheduled', 'gold_collected',
  'assay_completed', 'customs_cleared', 'flight_departed', 'arrival_dubai',
  'delivery_refinery', 'payment_released'
]);

export const walletCurrencyEnum = pgEnum('wallet_currency', ['USD', 'EUR', 'AED', 'XOF', 'USDT']);

export const bureauDAchat = pgTable('bureau_d_achat', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  // Directory (public)
  legalName: text('legal_name'),
  licenseNumber: text('license_number'),
  licenseStatus: text('license_status').notNull().default('authorized'),
  region: text('region'),
  contactPhone: text('contact_phone'),
  email: text('email'),
  services: jsonb('services').$type<Array<'buying' | 'exporting' | 'testing' | 'logistics'>>().default(['buying']),
  publicVisible: boolean('public_visible').notNull().default(true),

  name: text('name').notNull(),
  authorizationNumber: text('authorization_number').notNull(),
  attributionDate: timestamp('attribution_date'),
  expirationDate: timestamp('expiration_date'),
  country: text('country').notNull().default('CI'),
  city: text('city').notNull(),
  locationDetail: text('location_detail'),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  managers: jsonb('managers').$type<string[]>().default([]),
  phones: jsonb('phones').$type<string[]>().default([]),
  isActive: boolean('is_active').notNull().default(true),
  isVerified: boolean('is_verified').notNull().default(true),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('5.00'),
  totalSalesKg: decimal('total_sales_kg', { precision: 15, scale: 4 }).default('0'),
  completedOrders: integer('completed_orders').default(0),
  linkedUserId: integer('linked_user_id').references(() => eceUsers.id),
  metadata: jsonb('metadata').$type<{
    certifications?: string[];
    operationalHours?: string;
    specializations?: string[];
    website?: string;
    photos?: string[];
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const goldOffers = pgTable('gold_offers', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  bureauId: integer('bureau_id').references(() => bureauDAchat.id, { onDelete: 'cascade' }).notNull(),
  
  weightGrams: decimal('weight_grams', { precision: 15, scale: 4 }).notNull(),
  purityCarat: decimal('purity_carat', { precision: 4, scale: 2 }).notNull().default('22.00'),
  fineWeightGrams: decimal('fine_weight_grams', { precision: 15, scale: 4 }),
  
  pricePerGramUsd: decimal('price_per_gram_usd', { precision: 15, scale: 4 }),
  discountPercent: decimal('discount_percent', { precision: 5, scale: 2 }).default('0.00'),
  
  productionType: text('production_type', { 
    enum: ['artisanal', 'semi_industrial', 'industrial'] 
  }).default('artisanal'),
  sourceRegion: text('source_region'),
  batchId: text('batch_id'),
  
  photos: jsonb('photos').$type<string[]>().default([]),
  
  isAvailable: boolean('is_available').notNull().default(true),
  reservedForOrderId: integer('reserved_for_order_id'),
  reservedUntil: timestamp('reserved_until'),
  
  assayCertificateUrl: text('assay_certificate_url'),
  originCertificateUrl: text('origin_certificate_url'),
  
  metadata: jsonb('metadata').$type<{
    mineLocation?: string;
    productionDate?: string;
    witnesses?: string[];
    notes?: string;
    seeded?: boolean;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const traderWallets = pgTable('trader_wallets', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  
  balanceUsd: decimal('balance_usd', { precision: 20, scale: 4 }).notNull().default('0'),
  balanceEur: decimal('balance_eur', { precision: 20, scale: 4 }).notNull().default('0'),
  balanceAed: decimal('balance_aed', { precision: 20, scale: 4 }).notNull().default('0'),
  balanceXof: decimal('balance_xof', { precision: 20, scale: 4 }).notNull().default('0'),
  balanceUsdt: decimal('balance_usdt', { precision: 20, scale: 4 }).notNull().default('0'),
  
  escrowUsd: decimal('escrow_usd', { precision: 20, scale: 4 }).notNull().default('0'),
  escrowEur: decimal('escrow_eur', { precision: 20, scale: 4 }).notNull().default('0'),
  escrowAed: decimal('escrow_aed', { precision: 20, scale: 4 }).notNull().default('0'),
  escrowXof: decimal('escrow_xof', { precision: 20, scale: 4 }).notNull().default('0'),
  escrowUsdt: decimal('escrow_usdt', { precision: 20, scale: 4 }).notNull().default('0'),
  
  releasedUsd: decimal('released_usd', { precision: 20, scale: 4 }).notNull().default('0'),
  releasedEur: decimal('released_eur', { precision: 20, scale: 4 }).notNull().default('0'),
  releasedAed: decimal('released_aed', { precision: 20, scale: 4 }).notNull().default('0'),
  releasedXof: decimal('released_xof', { precision: 20, scale: 4 }).notNull().default('0'),
  releasedUsdt: decimal('released_usdt', { precision: 20, scale: 4 }).notNull().default('0'),
  
  primaryCurrency: text('primary_currency').notNull().default('USD'),
  
  kycVerified: boolean('kyc_verified').notNull().default(false),
  kycDocuments: jsonb('kyc_documents').$type<string[]>().default([]),
  
  bankDetails: jsonb('bank_details').$type<{
    bankName?: string;
    accountNumber?: string;
    swiftCode?: string;
    iban?: string;
  }>().default({}),
  
  cryptoAddresses: jsonb('crypto_addresses').$type<{
    usdt_trc20?: string;
    usdt_erc20?: string;
    btc?: string;
  }>().default({}),
  
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const goldWalletTransactions = pgTable('gold_wallet_transactions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  walletId: integer('wallet_id').references(() => traderWallets.id, { onDelete: 'cascade' }).notNull(),
  
  type: text('type', { 
    enum: ['deposit', 'withdrawal', 'escrow_lock', 'escrow_release', 'payment', 'refund', 'transfer'] 
  }).notNull(),
  direction: text('direction', { enum: ['credit', 'debit'] }).notNull(),
  
  amount: decimal('amount', { precision: 20, scale: 4 }).notNull(),
  currency: walletCurrencyEnum('currency').notNull(),
  
  balanceBefore: decimal('balance_before', { precision: 20, scale: 4 }),
  balanceAfter: decimal('balance_after', { precision: 20, scale: 4 }),
  
  relatedOrderId: integer('related_order_id'),
  relatedOfferId: integer('related_offer_id'),
  
  paymentMethod: text('payment_method'),
  externalReference: text('external_reference'),
  
  status: text('status', { enum: ['pending', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  failureReason: text('failure_reason'),
  
  metadata: jsonb('metadata').$type<{
    bankReference?: string;
    cryptoTxHash?: string;
    notes?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at')
});

export const goldGroupages = pgTable('gold_groupages', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  buyerUserId: integer('buyer_user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  
  totalBudgetUsd: decimal('total_budget_usd', { precision: 20, scale: 4 }).notNull(),
  allocatedBudgetUsd: decimal('allocated_budget_usd', { precision: 20, scale: 4 }).notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  
  totalWeightGrams: decimal('total_weight_grams', { precision: 15, scale: 4 }).notNull().default('0'),
  averagePurity: decimal('average_purity', { precision: 4, scale: 2 }),
  
  exportHub: text('export_hub').default('Abidjan'),
  
  status: text('status', { 
    enum: ['planning', 'collecting', 'consolidating', 'exporting', 'completed', 'cancelled'] 
  }).notNull().default('planning'),
  
  estimatedDeliveryDate: timestamp('estimated_delivery_date'),
  actualDeliveryDate: timestamp('actual_delivery_date'),
  
  sellerCount: integer('seller_count').default(0),
  
  metadata: jsonb('metadata').$type<{
    routeDetails?: string;
    flightNumber?: string;
    consolidationNotes?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const goldPurchaseOrders = pgTable('gold_purchase_orders', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  orderNumber: text('order_number').notNull().unique(),
  
  buyerUserId: integer('buyer_user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  bureauId: integer('bureau_id').references(() => bureauDAchat.id).notNull(),
  offerId: integer('offer_id').references(() => goldOffers.id),
  groupageId: integer('groupage_id').references(() => goldGroupages.id),
  
  weightGrams: decimal('weight_grams', { precision: 15, scale: 4 }).notNull(),
  purityCarat: decimal('purity_carat', { precision: 4, scale: 2 }).notNull(),
  fineWeightGrams: decimal('fine_weight_grams', { precision: 15, scale: 4 }),
  
  pricePerGramUsd: decimal('price_per_gram_usd', { precision: 15, scale: 4 }).notNull(),
  totalPriceUsd: decimal('total_price_usd', { precision: 20, scale: 4 }).notNull(),
  discountApplied: decimal('discount_applied', { precision: 5, scale: 2 }).default('0.00'),
  
  escrowAmountUsd: decimal('escrow_amount_usd', { precision: 20, scale: 4 }).notNull(),
  escrowLockedAt: timestamp('escrow_locked_at'),
  escrowReleasedAt: timestamp('escrow_released_at'),
  
  status: goldOrderStatusEnum('status').notNull().default('pending'),
  currentDeliveryStep: goldDeliveryStepEnum('current_delivery_step'),
  
  sellerAcceptedAt: timestamp('seller_accepted_at'),
  sellerRejectedAt: timestamp('seller_rejected_at'),
  sellerRejectionReason: text('seller_rejection_reason'),
  
  metadata: jsonb('metadata').$type<{
    buyerNotes?: string;
    sellerNotes?: string;
    platformNotes?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const goldDeliveryEvents = pgTable('gold_delivery_events', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  orderId: integer('order_id').references(() => goldPurchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  
  step: goldDeliveryStepEnum('step').notNull(),
  stepNumber: integer('step_number').notNull(),
  
  title: text('title').notNull(),
  description: text('description'),
  
  location: text('location'),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  
  performedByUserId: integer('performed_by_user_id').references(() => eceUsers.id),
  performedByRole: text('performed_by_role'),
  
  documents: jsonb('documents').$type<Array<{
    type: string;
    name: string;
    url: string;
    uploadedAt: string;
  }>>().default([]),
  
  photos: jsonb('photos').$type<string[]>().default([]),
  
  isCompleted: boolean('is_completed').notNull().default(false),
  completedAt: timestamp('completed_at'),
  
  metadata: jsonb('metadata').$type<{
    witnessNames?: string[];
    gpsCoordinates?: { lat: number; lng: number };
    notes?: string;
    transportAgentName?: string;
    vehicleId?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow()
});

export const goldOriginDocuments = pgTable('gold_origin_documents', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  orderId: integer('order_id').references(() => goldPurchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  bureauId: integer('bureau_id').references(() => bureauDAchat.id).notNull(),
  
  documentType: text('document_type', {
    enum: ['license', 'assay_certificate', 'origin_certificate', 'conformity_certificate', 
           'customs_approval', 'export_permit', 'transport_waybill', 'insurance_certificate',
           'weight_verification', 'photo_documentation', 'gps_log']
  }).notNull(),
  
  documentNumber: text('document_number'),
  documentName: text('document_name').notNull(),
  documentUrl: text('document_url').notNull(),
  
  issuedBy: text('issued_by'),
  issuedAt: timestamp('issued_at'),
  validUntil: timestamp('valid_until'),
  
  isVerified: boolean('is_verified').notNull().default(false),
  verifiedBy: integer('verified_by').references(() => eceUsers.id),
  verifiedAt: timestamp('verified_at'),
  
  metadata: jsonb('metadata').$type<{
    weight?: string;
    purity?: string;
    batchId?: string;
    mineLocation?: string;
    productionType?: string;
  }>().default({}),
  
  createdAt: timestamp('created_at').defaultNow()
});

export const lbmaPriceCache = pgTable('lbma_price_cache', {
  id: serial('id').primaryKey(),
  pricePerOzUsd: decimal('price_per_oz_usd', { precision: 15, scale: 4 }).notNull(),
  pricePerGramUsd: decimal('price_per_gram_usd', { precision: 15, scale: 4 }).notNull(),
  pricePerKgUsd: decimal('price_per_kg_usd', { precision: 15, scale: 4 }).notNull(),
  
  pricePerOzEur: decimal('price_per_oz_eur', { precision: 15, scale: 4 }),
  pricePerOzAed: decimal('price_per_oz_aed', { precision: 15, scale: 4 }),
  pricePerOzXof: decimal('price_per_oz_xof', { precision: 15, scale: 4 }),
  
  fxRateEurUsd: decimal('fx_rate_eur_usd', { precision: 10, scale: 6 }),
  fxRateAedUsd: decimal('fx_rate_aed_usd', { precision: 10, scale: 6 }),
  fxRateXofUsd: decimal('fx_rate_xof_usd', { precision: 10, scale: 6 }),
  
  source: text('source').default('LBMA'),
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  validUntil: timestamp('valid_until'),
  
  metadata: jsonb('metadata').$type<{
    amSession?: boolean;
    pmSession?: boolean;
    rawResponse?: any;
  }>().default({})
});

// ========================================
// BOURSE DE L'OR (BDO) — Merchant-of-Record Retail/Vault/Resale
// ========================================

export const bdoVaultUnitStatusEnum = pgEnum("bdo_vault_unit_status", [
  "stored",
  "delivered",
  "listed_for_resale",
  "sold",
]);

export const bdoDeliveryStatusEnum = pgEnum("bdo_delivery_status", [
  "created",
  "in_transit",
  "delivered",
  "cancelled",
]);

export const bdoResaleAuthorizationStatusEnum = pgEnum("bdo_resale_authorization_status", [
  "active",
  "revoked",
  "expired",
]);

export const bdoSecondaryMarketListingStatusEnum = pgEnum("bdo_secondary_market_listing_status", [
  "active",
  "sold",
  "expired",
  "cancelled",
]);

export const bdoSecondaryMarketTradeStatusEnum = pgEnum("bdo_secondary_market_trade_status", [
  "completed",
  "failed",
  "cancelled",
]);

export const bdoGoldUnitDefinitions = pgTable("bdo_gold_unit_definitions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  unitSizeGrams: integer("unit_size_grams").notNull().unique(),
  purityMin: decimal("purity_min", { precision: 5, scale: 2 }),
  purityMax: decimal("purity_max", { precision: 5, scale: 2 }),
  availability: boolean("availability").notNull().default(true),
  capsByTier: jsonb("caps_by_tier").$type<Record<string, { perTx?: number; perDay?: number; perWeek?: number }>>().default({}),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bdoPricingSnapshots = pgTable("bdo_pricing_snapshots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  pricePerGram: decimal("price_per_gram", { precision: 15, scale: 6 }).notNull(),
  currency: text("currency").notNull().default("XOF"),
  pricingMethodId: text("pricing_method_id").notNull().default("internal"),
  sourceMeta: jsonb("source_meta").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bdoInventoryLots = pgTable("bdo_inventory_lots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  sourceType: text("source_type", { enum: ["supplier_purchase", "inventory_declaration", "other"] })
    .notNull()
    .default("other"),
  sourceId: integer("source_id"),
  verifiedWeightGrams: decimal("verified_weight_grams", { precision: 15, scale: 4 }).notNull(),
  verifiedPurity: decimal("verified_purity", { precision: 6, scale: 4 }),
  custodyLocation: text("custody_location"),
  verificationLevel: text("verification_level").default("standard"),
  docs: jsonb("docs").$type<string[]>().default([]),
  status: text("status", { enum: ["available", "allocated", "depleted"] }).notNull().default("available"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bdoGoldAcquisitionRecords = pgTable("bdo_gold_acquisition_records", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  userId: integer("user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
  unitSizeGrams: integer("unit_size_grams").notNull(),
  purity: decimal("purity", { precision: 6, scale: 4 }).notNull().default("0.9950"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  pricePerGram: decimal("price_per_gram", { precision: 15, scale: 6 }).notNull(),
  totalPrice: decimal("total_price", { precision: 20, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("XOF"),
  pricingSnapshotId: integer("pricing_snapshot_id").references(() => bdoPricingSnapshots.id, { onDelete: "set null" }),
  allocatedLotIds: jsonb("allocated_lot_ids").$type<number[]>().default([]),
  proofDocs: jsonb("proof_docs").$type<string[]>().default([]),
  custodyLocation: text("custody_location"),
  lockupEndDate: timestamp("lockup_end_date"),
  status: text("status", { enum: ["stored", "delivered", "listed_for_resale", "sold"] }).notNull().default("stored"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bdoVirtualVaults = pgTable("bdo_virtual_vaults", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  ownerUserId: integer("owner_user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull().unique(),
  custodyLocation: text("custody_location").default("virtual_vault"),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bdoVaultGoldUnits = pgTable("bdo_vault_gold_units", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  vaultId: integer("vault_id").references(() => bdoVirtualVaults.id, { onDelete: "cascade" }).notNull(),
  acquisitionId: integer("acquisition_id").references(() => bdoGoldAcquisitionRecords.id, { onDelete: "set null" }),
  unitSizeGrams: integer("unit_size_grams").notNull(),
  purity: decimal("purity", { precision: 6, scale: 4 }).notNull().default("0.9950"),
  status: bdoVaultUnitStatusEnum("status").notNull().default("stored"),
  lockupEndDate: timestamp("lockup_end_date"),
  deliveryStatus: bdoDeliveryStatusEnum("delivery_status").notNull().default("created"),
  resaleListingId: integer("resale_listing_id"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bdoDeliveryOrders = pgTable("bdo_delivery_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  userId: integer("user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
  vaultUnitId: integer("vault_unit_id").references(() => bdoVaultGoldUnits.id, { onDelete: "cascade" }).notNull(),
  carrierId: text("carrier_id").default("internal"),
  destination: jsonb("destination")
    .$type<{ address?: string; city?: string; country?: string; lat?: number; lng?: number }>()
    .default({}),
  fees: decimal("fees", { precision: 15, scale: 2 }).notNull().default("0.00"),
  currency: text("currency").notNull().default("XOF"),
  status: bdoDeliveryStatusEnum("status").notNull().default("created"),
  trackingEvents: jsonb("tracking_events")
    .$type<Array<{ eventType: string; description?: string; location?: string; timestamp: string }>>()
    .default([]),
  proofDocs: jsonb("proof_docs").$type<string[]>().default([]),
  deliveredAt: timestamp("delivered_at"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bdoResaleAuthorizations = pgTable("bdo_resale_authorizations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  vaultUnitId: integer("vault_unit_id").references(() => bdoVaultGoldUnits.id, { onDelete: "cascade" }).notNull(),
  ownerUserId: integer("owner_user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
  authorizedAt: timestamp("authorized_at").notNull().defaultNow(),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 4 }).notNull().default("0.1500"),
  listingDurationDays: integer("listing_duration_days").notNull().default(30),
  pricingRule: jsonb("pricing_rule").$type<Record<string, any>>().notNull().default({}),
  status: bdoResaleAuthorizationStatusEnum("status").notNull().default("active"),
  revokedAt: timestamp("revoked_at"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bdoSecondaryMarketListings = pgTable("bdo_secondary_market_listings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  vaultUnitId: integer("vault_unit_id").references(() => bdoVaultGoldUnits.id, { onDelete: "cascade" }).notNull(),
  sellerUserId: integer("seller_user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
  visibleTo: text("visible_to").notNull().default("confirmed_clients_only"),
  pricingRule: jsonb("pricing_rule").$type<Record<string, any>>().notNull().default({}),
  status: bdoSecondaryMarketListingStatusEnum("status").notNull().default("active"),
  expiresAt: timestamp("expires_at"),
  soldAt: timestamp("sold_at"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bdoSecondaryMarketTrades = pgTable("bdo_secondary_market_trades", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  listingId: integer("listing_id").references(() => bdoSecondaryMarketListings.id, { onDelete: "cascade" }).notNull(),
  buyerUserId: integer("buyer_user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
  sellerUserId: integer("seller_user_id").references(() => eceUsers.id, { onDelete: "cascade" }).notNull(),
  salePrice: decimal("sale_price", { precision: 20, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("XOF"),
  commissionAmount: decimal("commission_amount", { precision: 20, scale: 4 }).notNull().default("0"),
  walletTransactionIds: jsonb("wallet_transaction_ids").$type<Array<number | string>>().default([]),
  status: bdoSecondaryMarketTradeStatusEnum("status").notNull().default("completed"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bureauDAchatRelations = relations(bureauDAchat, ({ one, many }) => ({
  linkedUser: one(eceUsers, {
    fields: [bureauDAchat.linkedUserId],
    references: [eceUsers.id]
  }),
  offers: many(goldOffers),
  orders: many(goldPurchaseOrders),
  originDocuments: many(goldOriginDocuments)
}));

export const goldOffersRelations = relations(goldOffers, ({ one }) => ({
  bureau: one(bureauDAchat, {
    fields: [goldOffers.bureauId],
    references: [bureauDAchat.id]
  })
}));

export const traderWalletsRelations = relations(traderWallets, ({ one, many }) => ({
  user: one(eceUsers, {
    fields: [traderWallets.userId],
    references: [eceUsers.id]
  }),
  transactions: many(goldWalletTransactions)
}));

export const goldWalletTransactionsRelations = relations(goldWalletTransactions, ({ one }) => ({
  wallet: one(traderWallets, {
    fields: [goldWalletTransactions.walletId],
    references: [traderWallets.id]
  })
}));

export const goldGroupagesRelations = relations(goldGroupages, ({ one, many }) => ({
  buyer: one(eceUsers, {
    fields: [goldGroupages.buyerUserId],
    references: [eceUsers.id]
  }),
  orders: many(goldPurchaseOrders)
}));

export const goldPurchaseOrdersRelations = relations(goldPurchaseOrders, ({ one, many }) => ({
  buyer: one(eceUsers, {
    fields: [goldPurchaseOrders.buyerUserId],
    references: [eceUsers.id]
  }),
  bureau: one(bureauDAchat, {
    fields: [goldPurchaseOrders.bureauId],
    references: [bureauDAchat.id]
  }),
  offer: one(goldOffers, {
    fields: [goldPurchaseOrders.offerId],
    references: [goldOffers.id]
  }),
  groupage: one(goldGroupages, {
    fields: [goldPurchaseOrders.groupageId],
    references: [goldGroupages.id]
  }),
  deliveryEvents: many(goldDeliveryEvents),
  originDocuments: many(goldOriginDocuments)
}));

export const goldDeliveryEventsRelations = relations(goldDeliveryEvents, ({ one }) => ({
  order: one(goldPurchaseOrders, {
    fields: [goldDeliveryEvents.orderId],
    references: [goldPurchaseOrders.id]
  }),
  performedBy: one(eceUsers, {
    fields: [goldDeliveryEvents.performedByUserId],
    references: [eceUsers.id]
  })
}));

export const goldOriginDocumentsRelations = relations(goldOriginDocuments, ({ one }) => ({
  order: one(goldPurchaseOrders, {
    fields: [goldOriginDocuments.orderId],
    references: [goldPurchaseOrders.id]
  }),
  bureau: one(bureauDAchat, {
    fields: [goldOriginDocuments.bureauId],
    references: [bureauDAchat.id]
  }),
  verifiedByUser: one(eceUsers, {
    fields: [goldOriginDocuments.verifiedBy],
    references: [eceUsers.id]
  })
}));
