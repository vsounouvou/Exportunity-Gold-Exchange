import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, numeric, decimal, pgEnum, uuid } from "drizzle-orm/pg-core";
import { applicationStatusEnum } from "./enums";
import { tenants } from "./tenants";
import { geoTerritories } from "./territories";

export const userRoleEnum = pgEnum('ece_user_role', [
  'buyer',
  'supplier',
  'shareholder',
  'admin',
  'mine_owner',
  'authorized_gold_buyer',
  'jewelry_manufacturer',
  'jewelry_reseller',
  'machinery_manufacturer',
  'machinery_reseller',
  'investor',
  'neighborhood_contributor',
]);
export const verificationStatusEnum = pgEnum('verification_status', ['pending', 'verified', 'rejected', 'suspended']);
export const verificationLevelEnum = pgEnum('verification_level', ['NONE', 'BASIC_VERIFIED', 'GOLD_VERIFIED']);
export const inventoryStatusEnum = pgEnum('inventory_status', ['declared', 'verified', 'assayed', 'ready_for_export', 'in_transit', 'delivered']);
export const contractStatusEnum = pgEnum('contract_status', ['draft', 'pending_approval', 'active', 'fulfilled', 'cancelled']);
export const shipmentStatusEnum = pgEnum('shipment_status', ['pending_pickup', 'picked_up', 'in_transit', 'customs_clearance', 'delivered']);
export const assayStatusEnum = pgEnum('assay_status', ['pending', 'in_progress', 'completed', 'failed']);
export const accessRequestStatusEnum = pgEnum('access_request_status', ['pending', 'approved', 'rejected']);
export const sourcingRequestStatusEnum = pgEnum('sourcing_request_status', ['open', 'sourcing', 'matched', 'closed']);
export { applicationStatusEnum };

export type EceUserRole = 'buyer' | 'seller' | 'admin' | 'neighborhood_contributor';
export type BuyerType = 'wholesale' | 'retail';
export type Permission =
  | '*'
  | 'manage_products'
  | 'view_financials'
  | 'manage_users'
  | 'view_admin_dashboard'
  | 'manage_orders'
  | 'manage_shop'
  | 'manage_media'
  | 'view_media'
  | 'manage_strategy_feedback'
  | 'view_strategy_feedback';
export type VerificationLevel = 'NONE' | 'BASIC_VERIFIED' | 'GOLD_VERIFIED';

export const eceUsers = pgTable('ece_users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  role: userRoleEnum('role').notNull().default('buyer'),
  roles: jsonb('roles').$type<EceUserRole[]>().default(['buyer']),
  permissions: jsonb('permissions').$type<Permission[]>().default([]),
  isActive: boolean('is_active').notNull().default(true),
  emailVerified: boolean('email_verified').notNull().default(false),
  verificationLevel: verificationLevelEnum('verification_level').notNull().default('NONE'),
  phone: text('phone'),
  country: text('country'),
  timezone: text('timezone').default('UTC'),
  primaryTerritoryId: integer('primary_territory_id').references(() => geoTerritories.id, { onDelete: 'set null' }),
  lastLoginAt: timestamp('last_login_at'),
  currentMode: text('current_mode').$type<EceUserRole>().default('buyer'),
  buyerType: text('buyer_type').$type<BuyerType>().default('retail'),
  metadata: jsonb('metadata').$type<{
    profileComplete?: boolean;
    preferences?: Record<string, any>;
    seeded?: boolean;
    mustChangePassword?: boolean;
    passwordResetAt?: string;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const accessRequests = pgTable('access_requests', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  requestedRoles: jsonb('requested_roles').$type<EceUserRole[]>().notNull(),
  requestedPermissions: jsonb('requested_permissions').$type<Permission[]>().default([]),
  reason: text('reason'),
  businessType: text('business_type'),
  status: accessRequestStatusEnum('status').notNull().default('pending'),
  adminComment: text('admin_comment'),
  reviewedBy: integer('reviewed_by').references(() => eceUsers.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow()
});

export const marketAccessRequests = pgTable('market_access_requests', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  marketKey: text('market_key').notNull(), // e.g. "wholesale_gold"
  businessName: text('business_name'),
  licenseFileName: text('license_file_name'),
  notes: text('notes'),
  status: accessRequestStatusEnum('status').notNull().default('pending'),
  adminComment: text('admin_comment'),
  reviewedBy: integer('reviewed_by').references(() => eceUsers.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const sourcingRequests = pgTable('sourcing_requests', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  requesterUserId: integer('requester_user_id').references(() => eceUsers.id, { onDelete: 'set null' }),
  guestSessionId: text('guest_session_id'),

  productQuery: text('product_query').notNull(),
  quantityIntent: text('quantity_intent'),
  urgency: text('urgency'),
  qualityNotes: text('quality_notes'),

  marketKey: text('market_key').default('marketplace'),
  location: jsonb('location').$type<{
    lat?: number;
    lng?: number;
    countryId?: number;
    countryName?: string;
    countryCode?: string;
    regionId?: number;
    regionName?: string;
    cityId?: number;
    cityName?: string;
    label?: string;
  }>().default({}),

  status: sourcingRequestStatusEnum('status').notNull().default('open'),
  adminNotes: text('admin_notes'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const traderApplications = pgTable('trader_applications', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  applicationRef: text('application_ref').notNull().unique(),
  
  email: text('email'),
  contact: text('contact').notNull().default(''),
  displayName: text('display_name').notNull(),
  phone: text('phone'),
  
  requestedRole: userRoleEnum('requested_role').notNull(),
  companyName: text('company_name'),
  companyRegistration: text('company_registration'),
  country: text('country').notNull(),
  region: text('region'),
  city: text('city'),
  postalCode: text('postal_code'),
  address: text('address'),
  licenseNumber: text('license_number'),
  mineSubtype: text('mine_subtype'),
  jewelrySubtype: text('jewelry_subtype'),
  sellOnPlatform: text('sell_on_platform'),
  investmentRange: text('investment_range'),
  investorInterest: text('investor_interest'),
  
  documents: jsonb('documents').$type<Array<{
    type: 'trading_license' | 'business_registration' | 'government_authorization' | 'id_document' | 'proof_of_funds' | 'other';
    name: string;
    url: string;
    uploadedAt: string;
    size?: number;
    mimeType?: string;
  }>>().default([]),
  
  businessDescription: text('business_description'),
  tradingExperience: text('trading_experience'),
  expectedVolume: text('expected_volume'),
  referenceContacts: jsonb('reference_contacts').$type<Array<{
    name: string;
    company: string;
    phone?: string;
    email?: string;
  }>>().default([]),
  
  status: applicationStatusEnum('status').notNull().default('pending'),
  
  aiReviewScore: decimal('ai_review_score', { precision: 5, scale: 2 }),
  aiReviewResult: text('ai_review_result', { enum: ['approved', 'rejected', 'needs_review'] }),
  aiReviewReason: text('ai_review_reason'),
  aiReviewDetails: jsonb('ai_review_details').$type<{
    documentVerification?: { valid: boolean; issues?: string[] };
    businessLegitimacy?: { score: number; notes?: string };
    riskAssessment?: { level: 'low' | 'medium' | 'high'; factors?: string[] };
    recommendations?: string[];
  }>().default({}),
  aiReviewedAt: timestamp('ai_reviewed_at'),
  
  adminReviewNote: text('admin_review_note'),
  reviewedBy: integer('reviewed_by').references(() => eceUsers.id),
  reviewedAt: timestamp('reviewed_at'),
  
  createdUserId: integer('created_user_id').references(() => eceUsers.id),
  
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const eceSessions = pgTable('ece_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow()
});

export const passwordSetupTokens = pgTable('password_setup_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const buyerProfiles = pgTable('buyer_profiles', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull().unique(),
  companyName: text('company_name').notNull(),
  companyRegistration: text('company_registration'),
  country: text('country').notNull(),
  address: text('address'),
  verificationStatus: verificationStatusEnum('verification_status').notNull().default('pending'),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: integer('verified_by').references(() => eceUsers.id),
  proofOfFundsSubmitted: boolean('proof_of_funds_submitted').notNull().default(false),
  proofOfFundsVerified: boolean('proof_of_funds_verified').notNull().default(false),
  proofOfFundsAmount: decimal('proof_of_funds_amount', { precision: 15, scale: 2 }),
  proofOfFundsCurrency: text('proof_of_funds_currency').default('USD'),
  proofOfFundsDocuments: jsonb('proof_of_funds_documents').$type<string[]>().default([]),
  creditLimit: decimal('credit_limit', { precision: 15, scale: 2 }).default('0'),
  preferredCommodities: jsonb('preferred_commodities').$type<string[]>().default([]),
  annualVolume: decimal('annual_volume', { precision: 15, scale: 2 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const governmentSupplierLists = pgTable('government_supplier_lists', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  country: text('country').notNull(),
  sourceName: text('source_name').notNull(),
  uploadedBy: integer('uploaded_by').references(() => eceUsers.id),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
  effectiveDate: timestamp('effective_date'),
  expiryDate: timestamp('expiry_date'),
  isActive: boolean('is_active').notNull().default(true),
  documentUrl: text('document_url'),
  metadata: jsonb('metadata').$type<{
    totalSuppliers?: number;
    lastVerified?: string;
    notes?: string;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const supplierRegistryEntries = pgTable('supplier_registry_entries', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  governmentListId: integer('government_list_id').references(() => governmentSupplierLists.id, { onDelete: 'cascade' }).notNull(),
  supplierName: text('supplier_name').notNull(),
  companyId: text('company_id'),
  licenseNumber: text('license_number'),
  region: text('region'),
  commodityType: text('commodity_type').notNull().default('gold'),
  licenseExpiry: timestamp('license_expiry'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<{
    mineLocation?: string;
    productionCapacity?: number;
    certifications?: string[];
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const supplierProfiles = pgTable('supplier_profiles', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull().unique(),
  companyName: text('company_name').notNull(),
  country: text('country').notNull(),
  region: text('region'),
  registryEntryId: integer('registry_entry_id').references(() => supplierRegistryEntries.id),
  governmentRegistrationNumber: text('government_registration_number'),
  miningLicenseNumber: text('mining_license_number'),
  verificationStatus: verificationStatusEnum('verification_status').notNull().default('pending'),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: integer('verified_by').references(() => eceUsers.id),
  matchedToGovernmentList: boolean('matched_to_government_list').notNull().default(false),
  commodityTypes: jsonb('commodity_types').$type<string[]>().default(['gold']),
  productionCapacityKg: decimal('production_capacity_kg', { precision: 10, scale: 2 }),
  bankDetails: jsonb('bank_details').$type<{
    bankName?: string;
    accountNumber?: string;
    swiftCode?: string;
  }>().default({}),
  documents: jsonb('documents').$type<Array<{
    type: string;
    url: string;
    uploadedAt: string;
    verified: boolean;
  }>>().default([]),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const shareholderProfiles = pgTable('shareholder_profiles', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull().unique(),
  displayName: text('display_name').notNull(),
  sharePercentage: decimal('share_percentage', { precision: 5, scale: 2 }),
  investmentAmount: decimal('investment_amount', { precision: 15, scale: 2 }),
  investmentCurrency: text('investment_currency').default('USD'),
  dividendPreference: text('dividend_preference', { enum: ['reinvest', 'payout', 'mixed'] }).default('payout'),
  notificationPreferences: jsonb('notification_preferences').$type<{
    dailyReports?: boolean;
    weeklyReports?: boolean;
    criticalAlerts?: boolean;
  }>().default({ weeklyReports: true, criticalAlerts: true }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const inventoryDeclarations = pgTable('inventory_declarations', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  supplierId: integer('supplier_id').references(() => supplierProfiles.id, { onDelete: 'cascade' }).notNull(),
  commodityType: text('commodity_type').notNull().default('gold'),
  declaredWeightKg: decimal('declared_weight_kg', { precision: 10, scale: 4 }).notNull(),
  declaredPurity: decimal('declared_purity', { precision: 5, scale: 2 }),
  estimatedValueUsd: decimal('estimated_value_usd', { precision: 15, scale: 2 }),
  status: inventoryStatusEnum('status').notNull().default('declared'),
  mineLocation: text('mine_location'),
  productionDate: timestamp('production_date'),
  batchNumber: text('batch_number'),
  documents: jsonb('documents').$type<Array<{
    type: string;
    url: string;
    uploadedAt: string;
  }>>().default([]),
  readyForExport: boolean('ready_for_export').notNull().default(false),
  notes: text('notes'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const nationalAssayers = pgTable('national_assayers', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  accreditationNumber: text('accreditation_number'),
  isActive: boolean('is_active').notNull().default(true),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  address: text('address'),
  certifications: jsonb('certifications').$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow()
});

export const assayReports = pgTable('assay_reports', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  inventoryId: integer('inventory_id').references(() => inventoryDeclarations.id, { onDelete: 'cascade' }).notNull(),
  assayerId: integer('assayer_id').references(() => nationalAssayers.id),
  assayerName: text('assayer_name').notNull(),
  status: assayStatusEnum('status').notNull().default('pending'),
  reportNumber: text('report_number'),
  testedWeightKg: decimal('tested_weight_kg', { precision: 10, scale: 4 }),
  actualPurity: decimal('actual_purity', { precision: 5, scale: 4 }),
  fineWeightKg: decimal('fine_weight_kg', { precision: 10, scale: 4 }),
  assayDate: timestamp('assay_date'),
  reportUrl: text('report_url'),
  notes: text('notes'),
  isOfficial: boolean('is_official').notNull().default(true),
  metadata: jsonb('metadata').$type<{
    testingMethod?: string;
    witnessedBy?: string;
    sealNumber?: string;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const buyerRequests = pgTable('buyer_requests', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  buyerId: integer('buyer_id').references(() => buyerProfiles.id, { onDelete: 'cascade' }).notNull(),
  commodityType: text('commodity_type').notNull().default('gold'),
  requestedWeightKg: decimal('requested_weight_kg', { precision: 10, scale: 2 }).notNull(),
  minPurity: decimal('min_purity', { precision: 5, scale: 2 }),
  targetPricePerKg: decimal('target_price_per_kg', { precision: 15, scale: 2 }),
  currency: text('currency').default('USD'),
  deliveryCountry: text('delivery_country'),
  deliveryAddress: text('delivery_address'),
  requestedDeliveryDate: timestamp('requested_delivery_date'),
  status: text('status', { enum: ['pending', 'quoted', 'accepted', 'in_progress', 'fulfilled', 'cancelled'] }).notNull().default('pending'),
  notes: text('notes'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const pricingQuotes = pgTable('pricing_quotes', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  buyerRequestId: integer('buyer_request_id').references(() => buyerRequests.id, { onDelete: 'cascade' }).notNull(),
  quotedPricePerKg: decimal('quoted_price_per_kg', { precision: 15, scale: 2 }).notNull(),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  validUntil: timestamp('valid_until'),
  spotPriceReference: decimal('spot_price_reference', { precision: 15, scale: 2 }),
  premiumPercentage: decimal('premium_percentage', { precision: 5, scale: 2 }),
  status: text('status', { enum: ['pending', 'accepted', 'rejected', 'expired'] }).notNull().default('pending'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow()
});

export const contracts = pgTable('ece_contracts', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  contractNumber: text('contract_number').notNull().unique(),
  buyerId: integer('buyer_id').references(() => buyerProfiles.id).notNull(),
  buyerRequestId: integer('buyer_request_id').references(() => buyerRequests.id),
  quoteId: integer('quote_id').references(() => pricingQuotes.id),
  commodityType: text('commodity_type').notNull().default('gold'),
  contractedWeightKg: decimal('contracted_weight_kg', { precision: 10, scale: 4 }).notNull(),
  pricePerKg: decimal('price_per_kg', { precision: 15, scale: 2 }).notNull(),
  totalValue: decimal('total_value', { precision: 15, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  status: contractStatusEnum('status').notNull().default('draft'),
  deliveryCountry: text('delivery_country'),
  deliveryAddress: text('delivery_address'),
  expectedDeliveryDate: timestamp('expected_delivery_date'),
  contractDocumentUrl: text('contract_document_url'),
  signedByBuyer: boolean('signed_by_buyer').notNull().default(false),
  signedByPlatform: boolean('signed_by_platform').notNull().default(false),
  signedAt: timestamp('signed_at'),
  terms: jsonb('terms').$type<{
    paymentTerms?: string;
    deliveryTerms?: string;
    qualityTerms?: string;
    disputeResolution?: string;
  }>().default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const contractInventoryLinks = pgTable('contract_inventory_links', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  contractId: integer('contract_id').references(() => contracts.id, { onDelete: 'cascade' }).notNull(),
  inventoryId: integer('inventory_id').references(() => inventoryDeclarations.id, { onDelete: 'cascade' }).notNull(),
  allocatedWeightKg: decimal('allocated_weight_kg', { precision: 10, scale: 4 }).notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

export const logisticsPartners = pgTable('logistics_partners', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  countries: jsonb('countries').$type<string[]>().default([]),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  trackingUrlTemplate: text('tracking_url_template'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const shipments = pgTable('ece_shipments', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  shipmentNumber: text('shipment_number').notNull().unique(),
  contractId: integer('contract_id').references(() => contracts.id, { onDelete: 'cascade' }).notNull(),
  logisticsPartnerId: integer('logistics_partner_id').references(() => logisticsPartners.id),
  logisticsPartnerName: text('logistics_partner_name').notNull().default('BRINKS'),
  status: shipmentStatusEnum('status').notNull().default('pending_pickup'),
  weightKg: decimal('weight_kg', { precision: 10, scale: 4 }).notNull(),
  sealNumber: text('seal_number'),
  trackingNumber: text('tracking_number'),
  originCountry: text('origin_country'),
  originAddress: text('origin_address'),
  destinationCountry: text('destination_country'),
  destinationAddress: text('destination_address'),
  pickupScheduledAt: timestamp('pickup_scheduled_at'),
  pickedUpAt: timestamp('picked_up_at'),
  estimatedDeliveryAt: timestamp('estimated_delivery_at'),
  deliveredAt: timestamp('delivered_at'),
  customsDocuments: jsonb('customs_documents').$type<Array<{
    type: string;
    number: string;
    url?: string;
  }>>().default([]),
  insuranceValue: decimal('insurance_value', { precision: 15, scale: 2 }),
  insuranceCurrency: text('insurance_currency').default('USD'),
  notes: text('notes'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const shipmentEvents = pgTable('shipment_events', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  shipmentId: integer('shipment_id').references(() => shipments.id, { onDelete: 'cascade' }).notNull(),
  eventType: text('event_type').notNull(),
  description: text('description'),
  location: text('location'),
  eventTime: timestamp('event_time').notNull().defaultNow(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const traceabilityRecords = pgTable('traceability_records', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  entityType: text('entity_type', { enum: ['inventory', 'assay', 'contract', 'shipment'] }).notNull(),
  entityId: integer('entity_id').notNull(),
  stage: text('stage').notNull(),
  description: text('description').notNull(),
  actorId: integer('actor_id').references(() => eceUsers.id),
  actorRole: text('actor_role'),
  previousRecordId: integer('previous_record_id').references((): any => traceabilityRecords.id),
  location: text('location'),
  verificationHash: text('verification_hash'),
  metadata: jsonb('metadata').$type<{
    coordinates?: { lat: number; lng: number };
    documents?: string[];
    witnesses?: string[];
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const eceChatMessages = pgTable('ece_chat_messages', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  userId: integer('user_id').references(() => eceUsers.id, { onDelete: 'cascade' }).notNull(),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull().default('user'),
  content: text('content').notNull(),
  contextType: text('context_type'),
  contextId: integer('context_id'),
  metadata: jsonb('metadata').$type<{
    attachments?: string[];
    referencedEntities?: Array<{ type: string; id: number }>;
    aiModel?: string;
    tokensUsed?: number;
    requestedRole?: string;
    executedActions?: unknown[];
    quickReplies?: string[];
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const platformMetrics = pgTable('platform_metrics', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  metricDate: timestamp('metric_date').notNull(),
  totalRotations: integer('total_rotations').default(0),
  totalVolumeKg: decimal('total_volume_kg', { precision: 15, scale: 4 }).default('0'),
  totalValueUsd: decimal('total_value_usd', { precision: 20, scale: 2 }).default('0'),
  grossMarginUsd: decimal('gross_margin_usd', { precision: 15, scale: 2 }).default('0'),
  netMarginUsd: decimal('net_margin_usd', { precision: 15, scale: 2 }).default('0'),
  activeSuppliers: integer('active_suppliers').default(0),
  activeBuyers: integer('active_buyers').default(0),
  pendingContracts: integer('pending_contracts').default(0),
  inTransitShipments: integer('in_transit_shipments').default(0),
  countryBreakdown: jsonb('country_breakdown').$type<Record<string, {
    volume: number;
    value: number;
    rotations: number;
  }>>().default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const auditLogs = pgTable('ece_audit_logs', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  userId: integer('user_id').references(() => eceUsers.id),
  userRole: text('user_role'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: integer('entity_id'),
  previousState: jsonb('previous_state'),
  newState: jsonb('new_state'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const eceUsersRelations = relations(eceUsers, ({ one, many }) => ({
  buyerProfile: one(buyerProfiles, {
    fields: [eceUsers.id],
    references: [buyerProfiles.userId]
  }),
  supplierProfile: one(supplierProfiles, {
    fields: [eceUsers.id],
    references: [supplierProfiles.userId]
  }),
  shareholderProfile: one(shareholderProfiles, {
    fields: [eceUsers.id],
    references: [shareholderProfiles.userId]
  }),
  primaryTerritory: one(geoTerritories, {
    fields: [eceUsers.primaryTerritoryId],
    references: [geoTerritories.id]
  }),
  sessions: many(eceSessions),
  chatMessages: many(eceChatMessages),
  auditLogs: many(auditLogs)
}));

export const buyerProfilesRelations = relations(buyerProfiles, ({ one, many }) => ({
  user: one(eceUsers, {
    fields: [buyerProfiles.userId],
    references: [eceUsers.id]
  }),
  requests: many(buyerRequests),
  contracts: many(contracts)
}));

export const supplierProfilesRelations = relations(supplierProfiles, ({ one, many }) => ({
  user: one(eceUsers, {
    fields: [supplierProfiles.userId],
    references: [eceUsers.id]
  }),
  registryEntry: one(supplierRegistryEntries, {
    fields: [supplierProfiles.registryEntryId],
    references: [supplierRegistryEntries.id]
  }),
  inventoryDeclarations: many(inventoryDeclarations)
}));

export const inventoryDeclarationsRelations = relations(inventoryDeclarations, ({ one, many }) => ({
  supplier: one(supplierProfiles, {
    fields: [inventoryDeclarations.supplierId],
    references: [supplierProfiles.id]
  }),
  assayReports: many(assayReports),
  contractLinks: many(contractInventoryLinks)
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  buyer: one(buyerProfiles, {
    fields: [contracts.buyerId],
    references: [buyerProfiles.id]
  }),
  buyerRequest: one(buyerRequests, {
    fields: [contracts.buyerRequestId],
    references: [buyerRequests.id]
  }),
  quote: one(pricingQuotes, {
    fields: [contracts.quoteId],
    references: [pricingQuotes.id]
  }),
  inventoryLinks: many(contractInventoryLinks),
  shipments: many(shipments)
}));

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  contract: one(contracts, {
    fields: [shipments.contractId],
    references: [contracts.id]
  }),
  logisticsPartner: one(logisticsPartners, {
    fields: [shipments.logisticsPartnerId],
    references: [logisticsPartners.id]
  }),
  events: many(shipmentEvents)
}));

// ============================================
// EXPORTUNITY.MARKET - Local Producers Marketplace
// ============================================

export const producerTypeEnum = pgEnum('producer_type', ['producer', 'reseller', 'hybrid']);
export const producerStatusEnum = pgEnum('producer_status', ['active', 'inactive', 'pending', 'unverified']);

export const producerCategories = pgTable('producer_categories', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  icon: text('icon'),
  parentId: integer('parent_id').references((): any => producerCategories.id),
  metadata: jsonb('metadata').$type<{
    keywords?: string[];
    googlePlacesTypes?: string[];
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const producers = pgTable('producers', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  type: producerTypeEnum('type').notNull().default('producer'),
  status: producerStatusEnum('status').notNull().default('active'),
  categoryId: integer('category_id').references(() => producerCategories.id),
  ownerId: integer('owner_id').references(() => eceUsers.id),
  
  description: text('description'),
  shortDescription: text('short_description'),
  
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  address: text('address'),
  city: text('city'),
  region: text('region'),
  country: text('country').notNull(),
  postalCode: text('postal_code'),
  
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  email: text('email'),
  website: text('website'),
  
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  photos: jsonb('photos').$type<string[]>().default([]),
  
  localProductionRatio: integer('local_production_ratio').default(100),
  isVerified: boolean('is_verified').notNull().default(false),
  verifiedAt: timestamp('verified_at'),
  rating: decimal('rating', { precision: 2, scale: 1 }),
  reviewCount: integer('review_count').default(0),
  
  operatingHours: jsonb('operating_hours').$type<{
    monday?: { open: string; close: string };
    tuesday?: { open: string; close: string };
    wednesday?: { open: string; close: string };
    thursday?: { open: string; close: string };
    friday?: { open: string; close: string };
    saturday?: { open: string; close: string };
    sunday?: { open: string; close: string };
  }>().default({}),
  
  deliveryOptions: jsonb('delivery_options').$type<string[]>().default(['pickup']),
  paymentMethods: jsonb('payment_methods').$type<string[]>().default(['cash']),
  
  source: text('source').default('internal'),
  externalId: text('external_id'),
  externalData: jsonb('external_data').$type<Record<string, any>>().default({}),
  
  aiAgentConfig: jsonb('ai_agent_config').$type<{
    welcomeMessage?: string;
    tone?: string;
    specialInstructions?: string;
  }>().default({}),
  
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const producerProducts = pgTable('producer_products', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  producerId: integer('producer_id').references(() => producers.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: integer('category_id').references(() => producerCategories.id),
  
  price: decimal('price', { precision: 12, scale: 2 }),
  currency: text('currency').default('XOF'),
  unit: text('unit'),
  
  imageUrl: text('image_url'),
  photos: jsonb('photos').$type<string[]>().default([]),
  
  inStock: boolean('in_stock').notNull().default(true),
  stockQuantity: integer('stock_quantity'),
  
  preparationTime: text('preparation_time'),
  isCustomizable: boolean('is_customizable').default(false),
  
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const producerConversations = pgTable('producer_conversations', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  userId: integer('user_id').references(() => eceUsers.id),
  producerId: integer('producer_id').references(() => producers.id, { onDelete: 'cascade' }).notNull(),
  guestSessionId: text('guest_session_id'),
  
  status: text('status').default('active'),
  lastMessageAt: timestamp('last_message_at').defaultNow(),
  
  metadata: jsonb('metadata').$type<{
    userIntent?: string;
    preferences?: Record<string, any>;
    orderContext?: Record<string, any>;
  }>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const producerMessages = pgTable('producer_messages', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => tenants.id).notNull(),
  conversationId: integer('conversation_id').references(() => producerConversations.id, { onDelete: 'cascade' }).notNull(),
  
  senderType: text('sender_type').notNull(),
  content: text('content').notNull(),
  
  agentToAgentData: jsonb('agent_to_agent_data').$type<{
    fromAgent?: string;
    toAgent?: string;
    structuredRequest?: Record<string, any>;
    structuredResponse?: Record<string, any>;
  }>().default({}),
  
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').defaultNow()
});

export const producersRelations = relations(producers, ({ one, many }) => ({
  category: one(producerCategories, {
    fields: [producers.categoryId],
    references: [producerCategories.id]
  }),
  owner: one(eceUsers, {
    fields: [producers.ownerId],
    references: [eceUsers.id]
  }),
  products: many(producerProducts),
  conversations: many(producerConversations)
}));

export const producerProductsRelations = relations(producerProducts, ({ one }) => ({
  producer: one(producers, {
    fields: [producerProducts.producerId],
    references: [producers.id]
  }),
  category: one(producerCategories, {
    fields: [producerProducts.categoryId],
    references: [producerCategories.id]
  })
}));

export const producerConversationsRelations = relations(producerConversations, ({ one, many }) => ({
  user: one(eceUsers, {
    fields: [producerConversations.userId],
    references: [eceUsers.id]
  }),
  producer: one(producers, {
    fields: [producerConversations.producerId],
    references: [producers.id]
  }),
  messages: many(producerMessages)
}));

export const producerMessagesRelations = relations(producerMessages, ({ one }) => ({
  conversation: one(producerConversations, {
    fields: [producerMessages.conversationId],
    references: [producerConversations.id]
  })
}));
